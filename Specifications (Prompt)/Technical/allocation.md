# Multi-Buyer Allocation

## Objective

Split forecast/actual produce across multiple Buyers, balancing revenue, constraints, and concentration risk.

## Model

Variable `x[i,g] = quantity of grade g allocated to buyer i`

Maximize estimated net value:

`MAX Σ (price[i,g] - logistics_cost[i,g] - risk_cost[i]) × x[i,g]`

Constraints: supply capacity, buyer demand, minimum order, grade acceptance, delivery window, contract reservation, logistics capacity, and quantity increments

Use OR-Tools CP-SAT/MILP; represent money as integer satang or another minor unit, and never use floating point in the solver

## Strategies

- `MANUAL`: user-defined
- `PROPORTIONAL`: split by demand ratio
- `MAX_NET_REVENUE`: optimize net value
- `RISK_AWARE`: limit concentration and use explainable risk categories

## API

`POST /api/optimization/allocate` → produce, strategy, offer IDs

Output: status, allocations, estimated revenue, constraint warnings, solver version

## Acceptance criteria

- Total allocation does not exceed supply or demand
- The system reports infeasible constraints instead of returning a fake answer
- A proposal never modifies a confirmed contract automatically
- Recheck inventory and use a transaction lock before the actual reservation
