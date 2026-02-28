import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { OrderService } from './order.service';
import { OrderType } from './order.types';

@Resolver(() => OrderType)
export class OrderResolver {
  constructor(private readonly orderService: OrderService) {}

  @Mutation(() => OrderType, {
    description:
      'Check out the current cart, creating an order. ' +
      'Loyalty reward (if applied) is redeemed at this point.',
  })
  async checkout(@Context() ctx: any): Promise<OrderType> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const order = await this.orderService.checkout(userId);
    return this.orderService.toOrderType(order);
  }

  @Query(() => OrderType, { description: 'Retrieve an order by ID' })
  async order(@Args('id') id: string): Promise<OrderType> {
    const order = await this.orderService.getOrder(id);
    return this.orderService.toOrderType(order);
  }

  @Query(() => [OrderType], { description: 'Get all orders for the current user' })
  async myOrders(@Context() ctx: any): Promise<OrderType[]> {
    const userId = ctx.req.headers['x-user-id'] || 'default-user';
    const orders = await this.orderService.getOrdersByUser(userId);
    return orders.map((o) => this.orderService.toOrderType(o));
  }
}
