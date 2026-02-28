import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class OrderItemType {
  @Field()
  id: string;

  @Field()
  menuItemId: string;

  @Field()
  name: string;

  @Field(() => Int)
  priceCents: number;

  @Field(() => Int)
  quantity: number;

  @Field(() => Int)
  subtotalCents: number;
}

@ObjectType()
export class OrderType {
  @Field()
  id: string;

  @Field()
  userId: string;

  @Field(() => [OrderItemType])
  items: OrderItemType[];

  @Field(() => Int)
  subtotalCents: number;

  @Field(() => Int)
  discountCents: number;

  @Field(() => Int)
  totalCents: number;

  @Field({ nullable: true })
  rewardCode: string | null;

  @Field({ nullable: true })
  redemptionId: string | null;

  @Field()
  rewardRedemptionStatus: string;

  @Field()
  status: string;

  @Field()
  createdAt: Date;
}
