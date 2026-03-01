# Checkout Service

A backend service for a food ordering app with loyalty rewards integration. I built it with NestJS/GraphQL/TypeORM



## Setup & Running

```bash
npm install
npm start
# Server starts at http://localhost:3000/graphql
```


### Running Tests

```bash
npm test
```

---


### User Identity

Pass a user ID via header (no auth required):
```
x-user-id: user_123
```
Defaults to `"default-user"` if omitted.

### Example Flow ( Simulation works as intended)

**1. Browse the menu**
query {
  menu {
    id
    name
    description
    priceCents
    category
  }
}

**2. Add.remove items to cart**
mutation {
  addToCart(menuItemId: "item_001", quantity: 2) {
    subtotalCents
    totalCents
  }
}
mutation {
  removeFromCart(menuItemId: "item_001") {
    items { name quantity priceCents }
    subtotalCents
    totalCents
  }
}

**3. Apply a loyalty reward**
mutation {
  applyReward(code: "SAVE500") {
    subtotalCents
    appliedReward { code discountCents }
    totalCents
  }
}

**4. Checkout**
mutation {
  checkout {
    id
    subtotalCents
    discountCents
    totalCents
    rewardRedemptionStatus
  }
}

**5. View an order**
query {
  order(id: "order_a9a4485f-2a32-469d-a025-abf51e2b1504") {
    id
    subtotalCents
    discountCents
    totalCents
    rewardCode
    rewardRedemptionStatus
    status
    createdAt
    items {
      name
      quantity
      priceCents
      subtotalCents
    }
  }
}


## Edge Cases to Consider

You don't need to solve all of these perfectly, but we want to see that you've *thought* about them:

1. ### What if a customer applies a reward, but checkout goes down?
### -Customer-first discount policy
We put the customer first. If they saw a discounted price, we honor it. Better for our image.
The order goes through with the discount, and we flag it internally in case we need to reconcile it later. The customer is never surprised by a higher price.

2. ### What if the reward service times out during checkout? Do we still finish the order?
### -No retry on /redeem + Customer-first policy
Yes, if the reward service doesn’t respond (timeout or server error), we treat it the same as a temporary failure. The order completes, and the customer still gets the discount they were shown.

3. ### How do we make sure we don’t accidentally charge full price?
### -Persist-before-call 
As soon as the customer applies a reward, we save it on the cart before checkout starts.
That way, we always know what price the customer saw. If anything goes wrong during checkout, we stick to that price instead of removing the discount.

4. ### What if two checkouts try to use the same reward at the same time?
### -Concurrent checkout protection
Only one can succeed.
The loyalty system blocks the second attempt, and that second order continues without the discount. In a real production setup, we’d also add an extra lock to catch this even earlier. This acts as a safety measure to keep the discount amount correct as items are added or removed.


## Written Prompts

### 1. System Overview

The checkout flow proceeds in four phases:

```
Client
  │
  ├─ addToCart(menuItemId, qty)     → CartService creates/updates cart
  │
  ├─ applyReward(code)              → LoyaltyService.validateReward()
  │    └─ POST /validate            →   Loyalty Service (3 attempts, backoff)
  │         ← { valid, discountCents, rewardId }
  │    └─ CartService.applyReward() → stores rewardId + discountCents on cart
  │
  ├─ checkout()
  │    ├─ CartService.getActiveCart()
  │    ├─ LoyaltyService.redeemReward()
  │    │    ├─ persist Reward row (PENDING_REDEMPTION) ← BEFORE external call
  │    │    ├─ POST /redeem         →   Loyalty Service (no retry)
  │    │    └─ update Reward row (REDEEMED | UNCERTAIN | FAILED)
  │    ├─ decide final discount (see Failure Handling)
  │    ├─ create Order + OrderItems
  │    └─ mark Cart CHECKED_OUT
  │
  └─ order(id)                      → to retrieve order by ID
```


**Key design decisions:**

- **Validate at apply, redeem at checkout.** Validating earlier gives faster feedback. The actual redemption happens at the last responsible moment (checkout) to avoid reserving rewards for abandoned carts.

- **Reward invalidated on cart changes.** If a customer adds/removes items after applying a reward, the stored discount is cleared. They must re-apply. This ensures the discount amount is always current.

- **User identity via header.** No auth implemented; `x-user-id` header is trusted. One active cart per user at a time.

---

### 2. Failure Handling

#### Loyalty Service Down at Validate Time (`applyReward`)

The validate step retries up to 3 times with exponential backoff (300ms, 600ms) on 5xx responses. Connection refused is not retried. If all retries fail, `applyReward` returns a `ServiceUnavailableException` and the customer cannot apply a reward until the service recovers. The cart remains usable; checkout without a reward proceeds normally.

**Trade-off:** Blocking validate entirely on failure is strict but correct; we never show a discount that isn't confirmed. An alternative would be to accept a reward optimistically and reconcile later, but that risks displaying a price we can't honor.

#### Loyalty Service Slow/Timing Out at Validate

The validate call has a 5-second timeout. Slow responses up to that threshold are tolerated; beyond it, the call fails and is retried.

#### Loyalty Service Down at Checkout Time (redeemReward)

If its down, the `/redeem` call has an 8-second timeout and is **not retried** Retrying could cause double-redemption since 5xx is explicitly ambiguous.

**Discount policy under failure:**

| Redemption outcome | Discount applied? | Rationale |
|---|---|---|
| `redeemed` (200 success) | Yes | Happy path |
| `uncertain` (5xx or timeout) | Yes | Customer saw discounted price; absorb the risk |
| `failed` (4xx) |  No | Reward definitively rejected (expired, already used) |

The **uncertain** case favors the customer. If we charged full price and the redemption actually succeeded, the customer pays more than shown and they will be angry and our image taks a hit. If we give the discount and the redemption failed, we absorb a small loss ($5–$10 max). This is the right trade-off for a consumer product.

Uncertain redemptions are stored in the `rewards` table with `status = 'redemption_uncertain'` and the corresponding order has `rewardRedemptionStatus = 'uncertain'`. A production system would run a reconciliation job to:
### (Phase 2 of this project or if I had more time)
1. Query a "check redemption status" endpoint on the loyalty service (not in scope for this mock)
2. Update the reward and order records
3. Alert on high rates of uncertain redemptions(it signals re-evaluation somewhere)

#### Concurrent Checkouts with the Same Reward

The current solution does not have distributed locking, but the loyalty service is the authoritative source of truth. If two checkout requests race to `/redeem` with the same `rewardId`, the loyalty service should reject the second and the checkout would then proceed with `discountCents = 0`.


---

### 3. Data Model

```
carts
├─ id (PK)
├─ userId
├─ status: active | checked_out
├─ rewardCode (nullable)
├─ rewardId (from loyalty service, nullable)
├─ discountCents (nullable)
└─ ...

cart_items
├─ id (PK)
├─ cartId (FK → carts)(this value must match an id that exists in the carts table)
├─ menuItemId
├─ name (snapshot)
├─ priceCents (snapshot)
└─ quantity

orders
├─ id (PK)
├─ userId
├─ subtotalCents
├─ discountCents
├─ totalCents
├─ rewardCode (nullable)
├─ redemptionId (from loyalty service, nullable)
├─ rewardRedemptionStatus: none | redeemed | uncertain | failed
└─ status: confirmed

order_items
├─ id (PK)
├─ orderId (FK → orders)
├─ menuItemId
├─ name (snapshot)
├─ priceCents (snapshot)
└─ quantity

rewards                     ← loyalty integration audit log
├─ id (PK)
├─ rewardId                 ← loyalty service's ID
├─ rewardCode
├─ orderId (nullable)
├─ redemptionId (nullable)
├─ discountCents
├─ status: validated | pending_redemption | redeemed | redemption_uncertain | redemption_failed
└─ redeemError (nullable)
```


**Evolution paths:**

- **Multiple users:** The current model already supports this via `userId`; every cart and order has a userId on it. The main thing missing is a proper users table with authentication. Right now userId is just a string from a header; you'd make it a foreign key to a real users table and add auth middleware in front of the resolvers.

- **Payment processing:** Payment processing would mean adding a payments table linked to orders, with its own state machine.For example like pending → processing → succeeded | failed. The checkout flow would call the payment service after creating the order. Honestly the same uncertain-state problem we solved for loyalty redemptions would show up here too which is that a 500 from a payment provider is just as ambiguous as one from `/redeem`, so you'd handle it the same way: complete the order, flag it, reconcile async.
The bigger structural change with payments is that checkout becomes a multi-step transaction: create order → charge payment → redeem reward. 

- **Menu management:** The menu is currently static in-memory. Moving to a `menu_items` table enables dynamic updates, per-user pricing, and scheduled availability.

---

### 4. Observability

**Metrics I'd add:**

- `loyalty_validate_duration_ms` latency of `/validate` calls
- `loyalty_validate_error_rate` — rate of 5xx and timeout responses
- `loyalty_redeem_outcome_total` (counter, labeled by outcome: redeemed/uncertain/failed) — needed for catching redemption issues
- `checkout_duration_ms` — end-to-end checkout latency
- `cart_abandon_rate` — carts created vs checked out
- `reward_uncertain_total` — how often we're applying discounts we couldn't confirm - if this value is consistently high we might need to rethink a process

**Logs:**
All loyalty calls are logged with: reward code, order ID, HTTP status, response time, and outcome. This makes it possible to investigate any specific order. Structured JSON logs can be used to enable log aggregation and searching.

**Alerts I'd add:**
- `loyalty_validate_error_rate > 5%` for 5 minutes → page on-call (loyalty service degraded)
- `reward_uncertain_total > 10` in 1 hour → investigate (high ambiguity rate)
- `checkout_duration_ms P95 > 10s` → latency spike

**How to detect loyalty degradation before customers notice:**
The loyalty service's `/health` endpoint can be polled from a monitor every 30 seconds or so. A rising `loyalty_validate_error_rate` metric would trigger an early alert. The `/validate` retries provide a 10s window where the service can recover without any customer impact.

---

### 5. Technology Choices

**NestJS + TypeScript:** The assessment mentioned NestJS/TypeScript as the team's stack, so I decided to use it as patterns reduce cognitive overhead for reviewers and acts as a better represenetation on what Id do on the job. NestJS's dependency injection makes the service boundaries clean and testable. TypeScript catches a class of bugs at compile time instead of having to wait until production to see errors.

**GraphQL (code-first):** The checkout domain is a good fit for GraphQL; clients can request exactly the cart fields they need. The mutation-based API also maps naturally to the domain operations. The `@nestjs/graphql` code-first approach keeps schema and types in sync with the TypeScript source.

**TypeORM + sql.js (SQLite):** TypeORM gives us a clean entity model with migrations support. `sql.js` was used here because the sandbox environment couldn't compile native Node addons. For a real deployment, I'd use PostgreSQ specifically for row-level locking and better concurrency. 

**Axios rather than fetch:** Axios provides cleaner timeout handling and consistent error shapes across Node versions.

**What I'd change for high-throughput production:**

- **Database:** PostgreSQL (as mentioned before) with connection pooling (PgBouncer). Add an index on `carts(userId, status)` for the hot path.
- **Resilience:** Wrap the loyalty service with a circuit breaker like opossum. After N consecutive failures, open the circuit and fail fast rather than queuing slow requests.
- **Observability:** OpenTelemetry tracing with trace IDs propagated through loyalty service calls. Add `x-request-id` headers to all outbound calls.
- **Rate limiting:** Apply rate limits per user on cart mutations to prevent cart spam.
