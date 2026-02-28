import {
  Resolver,
  Mutation,
  Args,
  Context,
} from '@nestjs/graphql';
import { LoyaltyService } from './loyalty.service';
import { CartService } from '../cart/cart.service';
import { CartType } from '../cart/cart.types';
import { RewardValidationResult } from './loyalty.types';

@Resolver()
export class LoyaltyResolver {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly cartService: CartService,
  ) {}

  /**
   * Apply a reward code to the current cart.
   *
   * This calls the loyalty /validate endpoint, then stores the result on the cart.
   * The actual /redeem call happens at checkout to avoid premature redemption.
   */
  @Mutation(() => CartType, {
    description:
      'Validate and apply a loyalty reward code to the cart. ' +
      'The discount will be reflected immediately. Reward is redeemed at checkout.',
  })
  async applyReward(
    @Args('code') code: string,
    @Context() ctx: any,
  ): Promise<CartType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';

    // Get current cart to compute total for validation
    const cart = await this.cartService.getActiveCart(userId);
    const subtotal = this.cartService.computeSubtotal(cart);

    if (subtotal === 0) {
      throw new Error('Cannot apply a reward to an empty cart');
    }

    // Validate with loyalty service
    const validation = await this.loyaltyService.validateReward(code, subtotal);

    // Store validated reward on cart
    const updatedCart = await this.cartService.applyReward(
      userId,
      code,
      validation.rewardId,
      validation.discountCents,
    );

    return this.cartService.toCartType(updatedCart);
  }
}
