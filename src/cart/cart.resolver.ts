import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { CartService } from './cart.service';
import { CartType, AddItemInput } from './cart.types';

@Resolver(() => CartType)
export class CartResolver {
  constructor(private readonly cartService: CartService) {}

  @Query(() => CartType, {
    nullable: true,
    description: 'View your current cart',
  })
  async cart(@Context() ctx: any): Promise<CartType | null> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const cart = await this.cartService.getCart(userId);
    return cart ? this.cartService.toCartType(cart) : null;
  }

  @Mutation(() => CartType, { description: 'Add an item to the cart' })
  async addToCart(
    @Args('menuItemId') menuItemId: string,
    @Args('quantity', { type: () => Int }) quantity: number,
    @Context() ctx: any,
  ): Promise<CartType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const cart = await this.cartService.addItem(userId, menuItemId, quantity);
    return this.cartService.toCartType(cart);
  }

  @Mutation(() => CartType, { description: 'Remove an item from the cart' })
  async removeFromCart(
    @Args('menuItemId') menuItemId: string,
    @Context() ctx: any,
  ): Promise<CartType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const cart = await this.cartService.removeItem(userId, menuItemId);
    return this.cartService.toCartType(cart);
  }

  @Mutation(() => CartType, {
    description: 'Update the quantity of an item in the cart',
  })
  async updateCartItem(
    @Args('menuItemId') menuItemId: string,
    @Args('quantity', { type: () => Int }) quantity: number,
    @Context() ctx: any,
  ): Promise<CartType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const cart = await this.cartService.updateItemQuantity(
      userId,
      menuItemId,
      quantity,
    );
    return this.cartService.toCartType(cart);
  }

  @Mutation(() => CartType, { description: 'Remove an applied reward from the cart' })
  async removeReward(@Context() ctx: any): Promise<CartType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    await this.cartService.clearRewardByUserId(userId);
    const cart = await this.cartService.getActiveCart(userId);
    return this.cartService.toCartType(cart);
  }
}
