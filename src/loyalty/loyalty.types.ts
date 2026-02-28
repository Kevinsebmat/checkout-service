import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class RewardValidationResult {
  @Field()
  rewardId: string;

  @Field(() => Int)
  discountCents: number;

  @Field()
  message: string;
}
