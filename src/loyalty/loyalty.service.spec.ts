import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { LoyaltyService } from './loyalty.service';
import { Reward, RewardStatus } from './reward.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let rewardRepo: jest.Mocked<any>;

  beforeEach(async () => {
    rewardRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: getRepositoryToken(Reward), useValue: rewardRepo },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
    jest.clearAllMocks();
  });

  describe('validateReward', () => {
    it('returns discount details for a valid code', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          valid: true,
          discountCents: 500,
          rewardId: 'rwd_abc123',
          expiresAt: '2025-01-27T00:00:00.000Z',
        },
      });

      const result = await service.validateReward('SAVE500', 2000);
      expect(result).toEqual({ rewardId: 'rwd_abc123', discountCents: 500 });
    });

    it('throws BadRequestException for invalid codes', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { valid: false, reason: 'expired' },
      });

      await expect(service.validateReward('EXPIRED2024', 2000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceUnavailableException after exhausting retries on 500s', async () => {
      const err = Object.assign(new Error('Service Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      });
      mockedAxios.post.mockRejectedValue(err);

      await expect(service.validateReward('SAVE500', 2000)).rejects.toThrow(
        ServiceUnavailableException,
      );
      // Should have attempted 3 times (0 + 2 retries)
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    }, 10000);

    it('throws ServiceUnavailableException immediately on ECONNREFUSED', async () => {
      const err = Object.assign(new Error('connect ECONNREFUSED'), {
        isAxiosError: true,
        code: 'ECONNREFUSED',
      });
      mockedAxios.post.mockRejectedValue(err);

      await expect(service.validateReward('SAVE500', 2000)).rejects.toThrow(
        ServiceUnavailableException,
      );
      // Should NOT retry on connection refused
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('redeemReward', () => {
    it('returns redeemed status and redemptionId on success', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, redemptionId: 'rdm_xyz789' },
      });

      const result = await service.redeemReward(
        'rwd_abc123',
        'order_456',
        500,
        'SAVE500',
      );

      expect(result.status).toBe(RewardStatus.REDEEMED);
      expect(result.redemptionId).toBe('rdm_xyz789');
    });

    it('persists record BEFORE calling external service (save called before axios)', async () => {
      const callOrder: string[] = [];

      rewardRepo.save.mockImplementation(async () => {
        callOrder.push('save');
        return {};
      });

      mockedAxios.post.mockImplementation(async () => {
        callOrder.push('axios');
        return { data: { success: true, redemptionId: 'rdm_xyz789' } };
      });

      await service.redeemReward('rwd_abc123', 'order_456', 500, 'SAVE500');

      // save must have been called before axios.post
      expect(callOrder[0]).toBe('save');
      expect(callOrder).toContain('axios');
    });

    it('returns REDEMPTION_UNCERTAIN on 500 error', async () => {
      const err = Object.assign(new Error('Internal Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      });
      mockedAxios.post.mockRejectedValue(err);

      const result = await service.redeemReward(
        'rwd_abc123',
        'order_456',
        500,
        'SAVE500',
      );

      expect(result.status).toBe(RewardStatus.REDEMPTION_UNCERTAIN);
      expect(result.redemptionId).toBeNull();
    });

    it('returns REDEMPTION_UNCERTAIN on timeout (ECONNABORTED)', async () => {
      const err = Object.assign(new Error('timeout of 8000ms exceeded'), {
        isAxiosError: true,
        code: 'ECONNABORTED',
      });
      mockedAxios.post.mockRejectedValue(err);

      const result = await service.redeemReward(
        'rwd_abc123',
        'order_456',
        500,
        'SAVE500',
      );

      expect(result.status).toBe(RewardStatus.REDEMPTION_UNCERTAIN);
    });

    it('returns REDEMPTION_FAILED on 4xx errors', async () => {
      const err = Object.assign(new Error('Bad Request'), {
        isAxiosError: true,
        response: { status: 400, data: { reason: 'already_redeemed' } },
      });
      mockedAxios.post.mockRejectedValue(err);

      const result = await service.redeemReward(
        'rwd_abc123',
        'order_456',
        500,
        'SAVE500',
      );

      expect(result.status).toBe(RewardStatus.REDEMPTION_FAILED);
    });

    it('does NOT retry /redeem on 500 (to avoid double redemption)', async () => {
      const err = Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      });
      mockedAxios.post.mockRejectedValue(err);

      await service.redeemReward('rwd_abc123', 'order_456', 500, 'SAVE500');

      // /redeem is never retried
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
