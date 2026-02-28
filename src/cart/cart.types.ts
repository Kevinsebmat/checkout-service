import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';

@ObjectType()
export class CartItemType {
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
export class AppliedReward {
  @Field()
  code: string;

  @Field(() => Int)
  discountCents: number;
}

@ObjectType()
export class CartType {
  @Field()
  id: string;

  @Field()
  userId: string;

  @Field(() => [CartItemType])
  items: CartItemType[];

  @Field(() => Int)
  subtotalCents: number;

  @Field(() => AppliedReward, { nullable: true })
  appliedReward: AppliedReward | null;

  @Field(() => Int)
  totalCents: number;
}

@InputType()
export class AddItemInput {
  @Field()
  menuItemId: string;

  @Field(() => Int)
  quantity: number;
}
