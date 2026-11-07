# When to Mock

Choose the seam using [test-design.md](test-design.md). Mock collaborators outside that seam; keep the dependency real when its behavior is the proposition under test. Whether a collaborator is owned by the team does not determine whether mocking it is valid.

Typical substitutes include external API adapters, clocks, randomness and file-system boundaries. A mocked database can isolate a unit test but cannot establish a real persistence or integration claim.

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

### 1. Use dependency injection

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

### 2. Prefer SDK-style interfaces over generic fetchers

Create specific functions for each external operation instead of one generic function with conditional logic:

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

The SDK approach means:

- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which endpoints a test exercises
- Type safety per endpoint
