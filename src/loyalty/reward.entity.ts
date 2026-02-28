import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tracks the full lifecycle of a loyalty reward within our system.
 *
 * State machine:
 *   validated → pending_redemption → redeemed
 *                                  → redemption_uncertain  (500 on /redeem)
 *                                  → redemption_failed
 */
export enum RewardStatus {
  // Reward has been validated and applied to a cart
  VALIDATED = 'validated',
  // Checkout started, /redeem call in-flight or just completed
  PENDING_REDEMPTION = 'pending_redemption',
  // /redeem succeeded
  REDEEMED = 'redeemed',
  // /redeem returned 5xx — we don't know if it actually redeemed
  REDEMPTION_UNCERTAIN = 'redemption_uncertain',
  // /redeem definitively failed (4xx)
  REDEMPTION_FAILED = 'redemption_failed',
}

@Entity('rewards')
export class Reward {
  @PrimaryColumn()
  id: string;

  @Column()
  rewardId: string; // from loyalty service

  @Column()
  rewardCode: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  redemptionId: string; // from loyalty service on success

  @Column({ type: 'int' })
  discountCents: number;

  @Column({ type: 'varchar', default: RewardStatus.VALIDATED })
  status: RewardStatus;

  // Raw error from /redeem if it failed, for diagnostics
  @Column({ nullable: true })
  redeemError: string;

  // Number of reconciliation attempts for uncertain states
  @Column({ type: 'int', default: 0 })
  reconciliationAttempts: number;

  @Column({ nullable: true })
  reconciledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
