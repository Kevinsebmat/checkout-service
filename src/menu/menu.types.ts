import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class MenuItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  description: string;

  @Field(() => Int)
  priceCents: number;

  @Field()
  category: string;

  @Field(() => Boolean)
  available: boolean;
}
