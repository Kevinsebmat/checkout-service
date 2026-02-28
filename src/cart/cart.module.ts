import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { CartService } from './cart.service';
import { CartResolver } from './cart.resolver';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem]), MenuModule],
  providers: [CartService, CartResolver],
  exports: [CartService],
})
export class CartModule {}
