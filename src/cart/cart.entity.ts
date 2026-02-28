import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CartItem } from './cart-item.entity';

export enum CartStatus {
  ACTIVE = 'active',
  CHECKED_OUT = 'checked_out',
}

@Entity('carts')
export class Cart {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', default: CartStatus.ACTIVE })
  status: CartStatus;

  // Stored reward data (from loyalty /validate response)
  @Column({ nullable: true })
  rewardCode: string;

  @Column({ nullable: true })
  rewardId: string;

  @Column({ type: 'int', nullable: true })
  discountCents: number;

  // Track whether this is a percentage discount
  @Column({ type: 'boolean', default: false })
  isPercentageDiscount: boolean;

  @Column({ type: 'float', nullable: true })
  discountPercent: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CartItem, (item) => item.cart, {
    cascade: true,
    eager: true,
  })
  items: CartItem[];
}
