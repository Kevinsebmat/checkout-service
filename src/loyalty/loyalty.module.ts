import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reward } from './reward.entity';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyResolver } from './loyalty.resolver';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [TypeOrmModule.forFeature([Reward]), CartModule],
  providers: [LoyaltyService, LoyaltyResolver],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
