import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Reward } from '../loyalty/reward.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      autoSave: true,
      location: process.env.DB_PATH || 'checkout.db',
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
      entities: [Cart, CartItem, Order, OrderItem, Reward],
    }),
  ],
})
export class DatabaseModule {}
