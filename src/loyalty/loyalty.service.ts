import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Reward, RewardStatus } from './reward.entity';

const LOYALTY_BASE_URL =
  process.env.LOYALTY_SERVICE_URL || 'http://localhost:3001';

// How long to wait for the loyalty service before giving up
const VALIDATE_TIMEOUT_MS = 5000;
const REDEEM_TIMEOUT_MS = 8000;

// Max retries for validate (idempotent GET-like operation)
const VALIDATE_MAX_RETRIES = 2;

export interface ValidateResult {
  rewardId: string;
  discountCents: number;
}

export interface RedeemResult {
  redemptionId: string;
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(Reward)
    private readonly rewardRepo: Repository<Reward>,
  ) {}

  /**
   * Validate a reward code with the loyalty service.
   *
   * Retries on transient 5xx errors and timeouts (validate is safe to retry
   * since it has no side effects). Returns null on permanent failure so the
   * caller can decide whether to block checkout.
   *
   * Throws BadRequestException for invalid codes (4xx).
   * Throws ServiceUnavailableException if loyalty service is unreachable.
   */
  async validateReward(
    code: string,
    cartTotalCents: number,
  ): Promise<ValidateResult> {
    this.logger.log(
      `Validating reward code ${code} for cart total ${cartTotalCents}`,
    );

    let lastError: Error;
    for (let attempt = 0; attempt <= VALIDATE_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(300 * Math.pow(2, attempt - 1), 2000);
        this.logger.warn(
          `Retrying validate (attempt ${attempt + 1}) after ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }

      try {
        const response = await axios.post(
          `${LOYALTY_BASE_URL}/validate`,
          { code, cartTotal: cartTotalCents },
          {
            timeout: VALIDATE_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' },
          },
        );

        const data = response.data;

        if (!data.valid) {
          throw new BadRequestException(
            `Reward code "${code}" is not valid: ${data.reason || 'unknown reason'}`,
          );
        }

        this.logger.log(
          `Reward ${code} validated: ${data.discountCents} cents discount (rewardId: ${data.rewardId})`,
        );
        return { rewardId: data.rewardId, discountCents: data.discountCents };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;

        const axiosErr = err as AxiosError;
        if (axiosErr.response) {
          const status = axiosErr.response.status;
          if (status === 400 || status === 422) {
            // Client error — don't retry
            const body = axiosErr.response.data as any;
            throw new BadRequestException(
              body?.reason || 'Invalid reward code',
            );
          }
          // 5xx — retry
          this.logger.warn(
            `Loyalty /validate returned ${status} (attempt ${attempt + 1})`,
          );
          lastError = new Error(`Loyalty service error: ${status}`);
        } else if (axiosErr.code === 'ECONNABORTED') {
          this.logger.warn(
            `Loyalty /validate timed out (attempt ${attempt + 1})`,
          );
          lastError = new Error('Loyalty service timeout');
        } else if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
          this.logger.error(`Loyalty service unreachable: ${axiosErr.message}`);
          // Don't retry connection refused
          throw new ServiceUnavailableException(
            'Loyalty service is currently unavailable. Please try again later.',
          );
        } else {
          this.logger.error(`Unexpected error validating reward: ${err.message}`);
          lastError = err;
        }
      }
    }

    throw new ServiceUnavailableException(
      'Loyalty service is temporarily unavailable. Please try again shortly.',
    );
  }

  /**
   * Redeem a reward at checkout time.
   *
   * CRITICAL: This is NOT safe to retry blindly — if the first call actually
   * succeeded but we got a 500 response, a retry might double-redeem.
   *
   * Strategy:
   * - We persist a Reward row in PENDING_REDEMPTION state BEFORE calling /redeem
   * - If we get a clear success: mark REDEEMED, return redemptionId
   * - If we get a 500 (ambiguous): mark REDEMPTION_UNCERTAIN, still complete the
   *   order WITH the discount (the customer was shown the discounted price; we
   *   absorb the risk of a failed redemption rather than charge full price)
   * - If we get 4xx: mark REDEMPTION_FAILED, do NOT apply discount
   * - If we time out: treat as REDEMPTION_UNCERTAIN (same as 500)
   *
   * A background reconciliation job (not in scope for this implementation, but
   * documented) would poll for UNCERTAIN records and resolve them.
   */
  async redeemReward(
    rewardId: string,
    orderId: string,
    discountCents: number,
    rewardCode: string,
  ): Promise<{ redemptionId: string | null; status: RewardStatus }> {
    // Persist intent BEFORE calling external service
    // This ensures we have a record even if the process crashes mid-flight
    const reward = this.rewardRepo.create({
      id: `rwd_local_${uuidv4()}`,
      rewardId,
      rewardCode,
      orderId,
      discountCents,
      status: RewardStatus.PENDING_REDEMPTION,
    });
    await this.rewardRepo.save(reward);

    this.logger.log(
      `Attempting to redeem reward ${rewardId} for order ${orderId}`,
    );

    try {
      const response = await axios.post(
        `${LOYALTY_BASE_URL}/redeem`,
        { rewardId, orderId },
        {
          timeout: REDEEM_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const data = response.data;

      if (data.success) {
        reward.status = RewardStatus.REDEEMED;
        reward.redemptionId = data.redemptionId;
        await this.rewardRepo.save(reward);

        this.logger.log(
          `Reward ${rewardId} successfully redeemed: ${data.redemptionId}`,
        );
        return { redemptionId: data.redemptionId, status: RewardStatus.REDEEMED };
      } else {
        // Success HTTP but body says failure — treat as failed
        reward.status = RewardStatus.REDEMPTION_FAILED;
        reward.redeemError = JSON.stringify(data);
        await this.rewardRepo.save(reward);

        this.logger.warn(`Reward ${rewardId} redemption rejected: ${JSON.stringify(data)}`);
        return { redemptionId: null, status: RewardStatus.REDEMPTION_FAILED };
      }
    } catch (err) {
      const axiosErr = err as AxiosError;
      let isAmbiguous = false;

      if (axiosErr.response) {
        const status = axiosErr.response.status;
        if (status >= 500) {
          // 5xx from /redeem is explicitly ambiguous per the brief.
          // We do not know if the redemption succeeded.
          isAmbiguous = true;
          this.logger.error(
            `Loyalty /redeem returned ${status} for order ${orderId} — outcome is UNCERTAIN. ` +
              `Reward ${rewardId} needs manual/async reconciliation.`,
          );
        } else if (status === 409) {
          // Already redeemed — this is actually fine
          reward.status = RewardStatus.REDEEMED;
          reward.redeemError = 'Already redeemed (409)';
          await this.rewardRepo.save(reward);
          return { redemptionId: null, status: RewardStatus.REDEEMED };
        } else {
          // 4xx definitive failure
          reward.status = RewardStatus.REDEMPTION_FAILED;
          reward.redeemError = `HTTP ${status}: ${JSON.stringify(axiosErr.response.data)}`;
          await this.rewardRepo.save(reward);
          return { redemptionId: null, status: RewardStatus.REDEMPTION_FAILED };
        }
      } else if (axiosErr.code === 'ECONNABORTED') {
        // Timeout — we don't know if the request reached the server
        isAmbiguous = true;
        this.logger.error(
          `Loyalty /redeem timed out for order ${orderId} — outcome is UNCERTAIN`,
        );
      } else {
        // Network error — likely didn't reach server, but be conservative
        isAmbiguous = true;
        this.logger.error(
          `Loyalty /redeem network error for order ${orderId}: ${err.message}`,
        );
      }

      if (isAmbiguous) {
        reward.status = RewardStatus.REDEMPTION_UNCERTAIN;
        reward.redeemError = err.message;
        await this.rewardRepo.save(reward);
        return { redemptionId: null, status: RewardStatus.REDEMPTION_UNCERTAIN };
      }
    }
  }

  async getRewardsByOrderId(orderId: string): Promise<Reward[]> {
    return this.rewardRepo.find({ where: { orderId } });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
