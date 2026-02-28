import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  CONFIRMED = 'confirmed',
}

@Entity('orders')
export class Order {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  subtotalCents: number;

  @Column({ type: 'int', default: 0 })
  discountCents: number;

  @Column({ type: 'int' })
  totalCents: number;

  // null if no reward was applied
  @Column({ nullable: true })
  rewardCode: string;

  // The redemptionId returned by loyalty service, if successfully redeemed
  @Column({ nullable: true })
  redemptionId: string;

  /**
   * Tracks the outcome of the loyalty redemption attempt.
   * 'none' - no reward applied
   * 'redeemed' - successfully confirmed with loyalty service
   * 'uncertain' - 5xx or timeout from loyalty service; may or may not have redeemed
   * 'failed' - definitively failed (4xx)
   */
  @Column({ type: 'varchar', default: 'none' })
  rewardRedemptionStatus: 'none' | 'redeemed' | 'uncertain' | 'failed';

  @Column({ type: 'varchar', default: OrderStatus.CONFIRMED })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];
}
