MASTER PROMPT: AgriGuard — Smart Agricultural Procurement Platform

1. Project Overview

Build a modern, production-oriented, fully responsive web application called AgriGuard.

AgriGuard is a B2B agricultural procurement and transaction assurance platform that connects farmers and agricultural buyers, including factories, wholesalers, distributors, and produce collection centers.

The platform must support multiple agricultural products, especially fruits such as:

* Durian
* Mango
* Mangosteen
* Longan
* Orange
* Rambutan
* Other seasonal agricultural products

The application should not behave like a traditional e-commerce marketplace.

Instead, it should manage the entire agricultural procurement lifecycle:

Buyer Demand → Farmer Matching → Buyer Offers → Multi-Buyer Allocation → HarvestLock Agreement → Harvest & Delivery → GradeProof Quality Inspection → Payment Settlement → AgriTrust Reputation Update

The central innovation is to reduce uncertainty before harvesting and provide verifiable evidence throughout the transaction.

Build an interactive working application with realistic sample data, functional navigation, persistent records, role-based dashboards, and clear transaction workflows.

Do not create only a static landing page or visual prototype.

⸻

2. Product Vision

Main problem

Farmers often face uncertainty when selling agricultural produce:

1. They may not know which buyers are actively purchasing.
2. Buyers may offer different prices and purchasing conditions.
3. Buyers may cancel or fail to collect produce as agreed.
4. Produce quantity and quality may differ from initial estimates.
5. Buyers may dispute product grades after delivery.
6. Farmers may experience unexpected price reductions.
7. Payments may be delayed.
8. Farmers may have insufficient evidence to resolve disputes.

Buyers also experience problems:

1. Difficulty finding farms with suitable products.
2. Uncertainty about harvest readiness.
3. Inconsistent quality.
4. Unreliable delivery schedules.
5. Limited visibility into supply availability.
6. Difficulty coordinating purchases across multiple farms.

Proposed solution

AgriGuard combines six core systems:

1. Buyer-First Matching — Match purchase demand with suitable farms.
2. Smart Allocation Engine — Allocate produce among multiple buyers.
3. AgriTrust — Evaluate buyer reliability using verified transaction records.
4. HarvestLock — Confirm purchasing terms before harvesting.
5. GradeProof — Record quality inspections and compare results with agreements.
6. Settlement & Dispute Management — Track payments and manage transaction disagreements.

Core product principle

AgriGuard is not simply a marketplace where farmers post products and wait for buyers.

It is a transaction management platform that helps farmers determine:

* Who should buy their produce?
* How much should each buyer receive?
* Which buyer is more reliable?
* What price and quality conditions have been agreed upon?
* What happens if the actual harvest is smaller than expected?
* What happens if the buyer rejects produce?
* How can the farmer verify that payment is correct?

⸻

3. Target Users and Roles

Implement four user roles.

Role A: Farmer / Seller

Farmers should be able to:

* Register and manage their farms.
* Add agricultural produce listings.
* Specify expected harvest quantities.
* Specify expected harvest dates.
* View matching buyer requests.
* Review buyer reliability information.
* Receive purchasing offers.
* Negotiate quantities and prices.
* Allocate produce among multiple buyers.
* Confirm digital purchasing agreements.
* Create harvest and delivery records.
* Upload shipment evidence.
* Review quality inspection results.
* Dispute incorrect grading.
* Track payment status.
* View historical transactions.

Role B: Buyer

Buyers may be factories, wholesalers, exporters, distributors, or collection centers.

Buyers should be able to:

* Register a business profile.
* Complete business verification.
* Create purchase requests.
* Search for available produce.
* View matching farms.
* Submit purchase offers.
* Negotiate purchasing conditions.
* Confirm HarvestLock agreements.
* View reserved produce quantities.
* Schedule pickup or delivery.
* Record quality inspection results.
* Confirm accepted quantities.
* Review settlement calculations.
* Upload payment evidence.
* Track purchasing performance and AgriTrust metrics.

Role C: Quality Inspector

Inspectors should be able to:

* Access assigned deliveries.
* Scan or enter Lot IDs.
* Record received weights.
* Inspect produce quality.
* Assign grades based on defined criteria.
* Upload photos and supporting evidence.
* Record rejected quantities and reasons.
* Submit inspection reports.
* Participate in reinspection workflows.

Role D: Platform Administrator

Administrators should be able to:

* Manage users and permissions.
* Review business verification requests.
* Configure supported produce categories.
* Manage quality grading templates.
* Review disputed transactions.
* Monitor suspicious activity.
* Inspect transaction audit logs.
* Configure matching and scoring parameters.
* View platform analytics.

Use role-based access control so users can only perform authorized actions.

⸻

4. Design System and UI/UX

Create a polished agricultural fintech / supply-chain SaaS interface.

Visual identity

Brand name: AgriGuard

Brand positioning:

“Secure Every Harvest. Trust Every Trade.”

Color palette

* Primary: Forest Green #166534
* Secondary: Emerald #22C55E
* Accent: Lime #A3E635
* Background: #F8FAF9
* Dark Text: #111827
* Secondary Text: #64748B
* Border: #E2E8F0
* Warning: Amber #F59E0B
* Danger: Red #EF4444

Use a modern SaaS visual language inspired by Linear, Stripe Dashboard, and modern agricultural supply-chain software.

UI requirements

* Clean navigation sidebar.
* Dashboard cards with useful metrics.
* Interactive data tables.
* Status badges.
* Progress indicators.
* Timeline components.
* Step-by-step ordering workflows.
* Interactive charts.
* Confirmation dialogs.
* Toast notifications.
* Empty states.
* Loading skeletons.
* Responsive desktop, tablet, and mobile layouts.

Use:

* Next.js with TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide Icons
* Recharts for analytics
* React Hook Form and Zod for forms
* PostgreSQL with Supabase or an equivalent backend

Use Thai as the primary UI language, with English technical labels where appropriate.

All prices should use Thai Baht (THB), and dates should display in the Asia/Bangkok timezone.

⸻

5. Main Application Navigation

Create the following navigation structure.

Farmer Sidebar

1. Dashboard
2. My Farms
3. My Produce
4. Buyer Marketplace
5. Purchase Offers
6. Smart Allocation
7. HarvestLock Agreements
8. Harvest & Deliveries
9. GradeProof Results
10. Payments
11. Disputes
12. Transaction History
13. Profile & Settings

Buyer Sidebar

1. Dashboard
2. Purchase Requests
3. Find Farms
4. My Offers
5. Confirmed Orders
6. HarvestLock Agreements
7. Incoming Deliveries
8. Quality Inspections
9. Payments
10. AgriTrust Profile
11. Transaction History
12. Settings

Administrator Sidebar

1. Platform Overview
2. User Management
3. Business Verification
4. Transactions
5. Dispute Cases
6. Quality Standards
7. Trust & Risk Monitoring
8. Analytics
9. Audit Logs

⸻

6. Feature 1: Farmer Produce Management

Create a complete produce inventory management module.

Farmers can add expected agricultural produce before harvesting.

Produce listing fields

* Produce ID
* Farm ID
* Product category
* Fruit type
* Variety
* Estimated quantity (kg)
* Estimated harvest date
* Harvest date range
* Farm location
* Expected grade
* Estimated price range
* Produce photos
* Certifications, if available
* Availability status

Example

Product: Mango

Variety: Nam Dok Mai

Estimated Quantity: 5,000 kg

Expected Harvest Date: December 15, 2026

Location: Nakhon Ratchasima

Expected Grades: A and B

Availability: Open for Offers

Inventory statuses

* AVAILABLE
* PARTIALLY_RESERVED
* FULLY_RESERVED
* CONTRACTED
* HARVESTED
* DELIVERED
* CLOSED

Important logic

Estimated harvest quantity is not guaranteed actual inventory.

The system must distinguish between:

* Estimated supply
* Available uncommitted supply
* Temporarily reserved supply
* Contracted supply
* Harvested actual quantity
* Delivered quantity
* Accepted quantity
* Rejected quantity

Prevent double booking and over-allocation.

Display inventory availability using progress bars and segmented charts.

⸻

7. Feature 2: Buyer Purchase Request

Buyers can create structured purchasing requests.

Purchase request fields

* Request ID
* Buyer ID
* Fruit category
* Variety
* Requested quantity
* Minimum acceptable quantity
* Target price or price range
* Accepted grades
* Quality requirements
* Required delivery date range
* Delivery destination
* Logistics requirements
* Payment terms
* Request expiration date

Example

Buyer: FreshFruit Export Co.

Product: Nam Dok Mai Mango

Requested Quantity: 3,000 kg

Target Price: 45 THB/kg

Accepted Grade: A

Delivery Window: December 15–18, 2026

Payment Terms: Within 3 days after accepted inspection

Purchase request statuses

* DRAFT
* OPEN
* MATCHING
* PARTIALLY_FILLED
* FULLY_FILLED
* EXPIRED
* CANCELLED

Provide a purchase request creation wizard with validation and a review screen.

⸻

8. Feature 3: Buyer-First Smart Matching

Implement a hybrid matching engine.

Stage 1: Hard Constraint Filtering

Filter farms based on:

* Fruit type
* Variety
* Harvest date compatibility
* Minimum order quantity
* Quality requirements
* Delivery location
* Available supply

Stage 2: Ranking Algorithm

Calculate a matching score using:

* Harvest timing compatibility
* Quantity compatibility
* Distance
* Quality compatibility
* Historical reliability

Example formula:

MatchingScore = 0.30 HarvestMatch + 0.25 QuantityMatch + 0.20 QualityMatch + 0.15 DistanceScore + 0.10 Reliability

Normalize all factors to a 0–100 scale.

The formula is configurable and is an initial heuristic, not a trained AI model.

UI

Display matching results as interactive cards.

Each card should include:

* Farm name
* Produce type
* Available quantity
* Expected harvest date
* Distance
* Matching score
* Matching reasons
* View farm button
* Submit offer button

Provide a matching explanation panel:

“Recommended because harvest timing matches your requested delivery window, the farm has sufficient supply, and quality requirements are compatible.”

Do not describe the matching as AI-powered unless an actual AI model has been implemented.

⸻

9. Feature 4: AgriTrust — Buyer Reliability System

Build an evidence-based buyer reliability module.

AgriTrust evaluates purchasing behavior using verified transaction records.

It is not a financial credit bureau score.

Scoring dimensions

1. Payment Reliability — 30%
2. Pickup Reliability — 25%
3. Contract Compliance — 20%
4. Quality Inspection Transparency — 15%
5. Dispute Resolution Performance — 10%

Formula

TrustScore = 0.30P + 0.25R + 0.20C + 0.15Q + 0.10D

Each factor is normalized from 0 to 100.

Buyer Profile UI

Display:

* Buyer name
* Verification status
* Trust score
* Number of verified transactions
* On-time payment rate
* On-time pickup rate
* Contract compliance rate
* Verified dispute history
* Historical performance chart
* Recent transaction events

Example

Buyer A:

Trust Score: 92/100

Completed Transactions: 42

On-Time Payment: 97%

On-Time Pickup: 91%

Verified Disputes: 2

Important fairness requirements

New buyers without transaction history should display:

“Insufficient Transaction Data”

Do not automatically assign low scores to new buyers.

Do not penalize buyers based on unverified accusations.

Allow buyers to appeal incorrect transaction records.

Store evidence for score-affecting events.

Show score calculation explanations.

Do not treat a trust score as a guaranteed probability of payment.

⸻

10. Feature 5: Multi-Buyer Allocation Engine

This is one of the most important features.

Allow a farmer to divide a single harvest among multiple buyers.

Example

Farmer A has 5,000 kg of mangoes.

Three buyers submit offers:

Buyer	Requested Quantity	Price/kg	Trust Score
Buyer B	3,000 kg	45 THB	92
Buyer C	2,500 kg	48 THB	85
Buyer D	2,000 kg	50 THB	65

Total requested quantity: 7,500 kg.

Available estimated supply: 5,000 kg.

The system must help the farmer decide how to allocate the available supply.

Allocation modes

Implement three selectable allocation strategies.

Mode A: Manual Allocation

The farmer manually assigns quantities using sliders or numeric input fields.

Show:

* Quantity allocated to each buyer
* Percentage of total supply
* Expected revenue per buyer
* Total expected revenue
* Remaining available supply
* Trust score of each buyer

Prevent confirmation if the allocation exceeds available uncommitted supply.

Mode B: Proportional Allocation

Allocate supply proportionally to buyer demand.

Respect minimum lot sizes and other constraints.

If proportional allocation is infeasible, explain why.

Mode C: Revenue Optimization

Recommend allocations that maximize estimated net revenue.

Consider:

* Offered price
* Maximum buyer demand
* Available supply
* Minimum order quantity
* Estimated logistics costs
* Grade compatibility
* Delivery date compatibility

Use a deterministic optimization algorithm.

For a simple implementation, use linear programming or a suitable optimization library.

Optimization model

Let x[i] represent kilograms allocated to buyer i.

Maximize:

SUM((price[i] - cost[i]) * x[i])

Subject to:

SUM(x[i]) <= available_supply

0 <= x[i] <= buyer_demand[i]

Add constraints for minimum order quantity and delivery compatibility.

For grade-specific allocation, use x[i,g].

Allocation UI

Create an interactive allocation workspace with:

* Available supply summary
* Buyer offer comparison table
* Trust score indicators
* Allocation sliders
* Allocation percentage chart
* Expected revenue calculator
* Optimization recommendations
* Warning indicators
* Confirm allocation button

Reservation logic

When an allocation is tentatively accepted:

1. Create a temporary reservation.
2. Reduce uncommitted availability.
3. Set a reservation expiration time.
4. Notify the buyer.
5. Wait for agreement confirmation.

When a reservation expires, release it if no binding agreement exists.

Use database transactions and row locking or atomic conditional updates to prevent concurrent overbooking.

Important

An accepted offer is not automatically a binding contract unless the required agreement confirmation process has been completed.

⸻

11. Feature 6: HarvestLock — Pre-Harvest Digital Agreement

HarvestLock is the central legal workflow of AgriGuard.

After a farmer allocates produce to buyers, each buyer must confirm an individual purchasing agreement.

Contract structure

Use:

One Master Allocation Plan + Separate Buyer Agreements

Example:

Master Allocation Plan: 5,000 kg

* Buyer B Contract: 2,000 kg
* Buyer C Contract: 2,000 kg
* Buyer D Contract: 1,000 kg

Each buyer agreement is independent.

Contract fields

* Contract ID
* Farmer ID
* Buyer ID
* Produce ID
* Allocated quantity
* Quantity tolerance
* Fruit type and variety
* Grade requirements
* Price per grade
* Harvest date
* Delivery date
* Delivery destination
* Inspection criteria
* Sampling method
* Rejection conditions
* Payment deadline
* Deposit terms
* Cancellation conditions
* Shortfall allocation policy
* Dispute resolution procedure

Contract workflow

1. Generate draft agreement.
2. Display all terms.
3. Allow negotiation and amendments.
4. Create a new version after changes.
5. Require both parties to accept the same version.
6. Capture electronic signature or authenticated acceptance.
7. Generate a finalized PDF.
8. Store the finalized document.
9. Calculate document SHA-256 hash.
10. Mark the agreement as confirmed.

Contract statuses

* DRAFT
* NEGOTIATING
* AWAITING_SELLER
* AWAITING_BUYER
* CONFIRMED
* AMENDMENT_PENDING
* COMPLETED
* TERMINATED

Security requirements

Maintain an immutable or tamper-evident audit history of contract revisions.

Never overwrite previously accepted contract versions.

A contract amendment requires appropriate authorization and acceptance.

A hash alone does not establish legal validity.

Design the signing process with applicable Thai electronic transaction laws in mind.

⸻

12. Feature 7: Harvest & Delivery Tracking

After a confirmed agreement, farmers prepare and deliver produce.

Harvest record

Include:

* Harvest ID
* Contract ID
* Produce ID
* Actual harvest date
* Actual harvested quantity
* Harvest photos
* Responsible personnel

Lot tracking

Generate a unique Lot ID for each shipment or separated batch.

Example:

LOT-2026-MANGO-001

Each lot should be linked to:

* Farm
* Produce listing
* Contract
* Buyer
* Harvest record
* Delivery record
* Quality inspection
* Settlement

QR functionality

Generate a real scannable QR code containing a secure reference URL or opaque token.

Do not put sensitive personal information directly inside the QR code.

Delivery statuses

* PREPARING
* READY_FOR_PICKUP
* PICKED_UP
* IN_TRANSIT
* ARRIVED
* RECEIVED
* INSPECTION_PENDING

Delivery information

* Scheduled pickup date
* Actual pickup date
* Vehicle details
* Transport operator
* Gross weight
* Tare weight
* Net weight
* Pickup evidence
* Delivery evidence
* Receiving confirmation

Support optional digital weighing scale integration in future versions.

⸻

13. Feature 8: GradeProof — Quality Verification

GradeProof compares actual produce inspection results with HarvestLock terms.

Quality inspection form

Inspectors must record:

* Lot ID
* Contract ID
* Inspection date and time
* Inspector identity
* Received weight
* Accepted weight
* Rejected weight
* Grade distribution
* Defect categories
* Rejection reasons
* Sampling method
* Photos and supporting documents

Example

Received mangoes: 2,000 kg

Grade A: 1,600 kg

Grade B: 300 kg

Rejected: 100 kg

Quality criteria

Quality standards should be configurable by fruit type.

Do not use the same grading criteria for all produce.

Support separate templates for:

* Mango
* Durian
* Mangosteen
* Longan
* Orange
* Other products

Contract comparison engine

Automatically compare:

* Agreed quantity vs delivered quantity
* Agreed grades vs inspected grades
* Agreed price vs proposed settlement price
* Inspection method vs contract requirements
* Rejection reason vs agreed rejection conditions

Discrepancy alerts

Display warnings such as:

PRICE_DISCREPANCY

The proposed price differs from the confirmed agreement.

QUANTITY_SHORTFALL

Delivered quantity is below the agreed tolerance.

QC_EVIDENCE_MISSING

Required inspection evidence has not been submitted.

UNAUTHORIZED_REJECTION

The rejection reason is not included in the agreed criteria and requires review.

Do not automatically conclude that a party has violated the law.

Route disputed or ambiguous cases to human review.

⸻

14. Feature 9: Payment & Settlement

Create a settlement system that calculates the amount payable based on verified accepted quantities and agreed prices.

Example

Grade A: 1,600 kg × 45 THB = 72,000 THB

Grade B: 300 kg × 30 THB = 9,000 THB

Rejected: 100 kg × 0 THB = 0 THB

Total: 81,000 THB

Deposit: 10,000 THB

Remaining Payment: 71,000 THB

Payment module

Display:

* Contract value
* Accepted quantity
* Grade-based calculation
* Adjustments
* Deposits
* Total payable
* Outstanding amount
* Due date
* Payment status
* Payment evidence

Payment statuses

* NOT_DUE
* PAYMENT_PENDING
* PARTIALLY_PAID
* PAID
* OVERDUE
* DISPUTED

For the MVP, use simulated payments and uploaded payment confirmations.

Do not claim real payment processing or escrow functionality unless a properly integrated and authorized payment provider is available.

⸻

15. Feature 10: Dispute Management

Create a structured dispute resolution workflow.

Common disputes

* Buyer fails to collect produce.
* Buyer cancels after confirmation.
* Buyer changes the agreed price.
* Farmer delivers less than agreed.
* Quality grade is disputed.
* Buyer rejects produce without sufficient evidence.
* Payment is delayed.

Dispute workflow

1. A party opens a dispute.
2. The system identifies the related contract and transaction.
3. The system collects relevant evidence.
4. Both parties can submit explanations.
5. A reviewer examines the evidence.
6. Reinspection may be requested when appropriate.
7. The outcome is recorded.
8. Settlement is adjusted if authorized.
9. Verified events may affect AgriTrust.

Dispute UI

Display:

* Case ID
* Dispute category
* Contract reference
* Timeline
* Evidence gallery
* Statements from both parties
* Current status
* Reviewer notes
* Final outcome

Dispute statuses

* OPEN
* EVIDENCE_COLLECTION
* UNDER_REVIEW
* REINSPECTION_REQUESTED
* RESOLVED
* CLOSED

Do not automatically penalize users for unresolved disputes.

⸻

16. Feature 11: Dynamic Reallocation

When a buyer cancels or actual harvest quantities change, the system should recommend a new allocation.

Scenario A: Buyer cancellation

A farmer has 5,000 kg allocated to three buyers.

Buyer C cancels a 2,000 kg reservation.

The system should:

1. Determine whether the allocation is merely reserved or contractually confirmed.
2. Check applicable cancellation terms.
3. Identify legally and operationally available supply.
4. Search for alternative buyers.
5. Rank replacement offers.
6. Recommend a new allocation.
7. Require farmer confirmation.
8. Create new agreements as necessary.

Scenario B: Harvest shortfall

Expected supply: 5,000 kg

Actual harvest: 4,200 kg

Shortfall: 800 kg

The system must apply the agreed shortfall policy.

Possible policies:

* Proportional reduction
* Priority based on confirmed commitments
* Negotiated redistribution

Do not silently modify confirmed contracts.

Show the impact on each buyer and require any necessary amendments.

⸻

17. Complete Ordering State Machine

Implement the following main transaction states:

OFFER_PENDING

↓

RESERVED

↓

AWAITING_CONFIRMATION

↓

CONFIRMED

↓

HARVEST_SCHEDULED

↓

HARVESTED

↓

IN_TRANSIT

↓

DELIVERED

↓

QC_PENDING

↓

QC_ACCEPTED

↓

PAYMENT_PENDING

↓

PAID

↓

COMPLETED

Also support alternative branches:

* OFFER_REJECTED
* RESERVATION_EXPIRED
* CANCELLED
* SHORTFALL_REVIEW
* QC_DISPUTED
* PAYMENT_OVERDUE
* DISPUTED

Use a real state transition system.

Do not allow unauthorized or invalid status changes.

Every transition should record:

* Previous status
* New status
* User ID
* Timestamp
* Reason
* Supporting evidence when required

⸻

18. Database Schema

Design a relational database with at least the following tables:

Users and organizations

* users
* organizations
* organization_members
* farms
* buyer_profiles
* business_verifications

Produce and procurement

* produce_categories
* produce_listings
* harvest_forecasts
* purchase_requests
* matching_results
* purchase_offers

Allocation and contracts

* allocation_plans
* allocation_items
* inventory_reservations
* contracts
* contract_versions
* contract_acceptances

Logistics and quality

* harvest_records
* produce_lots
* lot_relationships
* deliveries
* weighing_records
* qc_inspections
* qc_grade_items
* qc_evidence

Financial and reputation

* settlements
* settlement_items
* payments
* trust_events
* trust_score_snapshots
* disputes
* dispute_evidence

System

* notifications
* audit_logs

Database requirements

* Use UUID primary keys.
* Add foreign key constraints.
* Use proper database indexes.
* Use numeric/decimal types for money and quantities.
* Store timestamps in UTC and display them in the user’s timezone.
* Enforce row-level access policies.
* Prevent duplicate inventory reservations.
* Preserve historical agreement versions.
* Support multiple buyers per produce listing.
* Support multiple deliveries per contract.
* Support multiple QC inspections where appropriate.

⸻

19. Dashboard Requirements

Farmer Dashboard

Show:

* Total estimated produce
* Available supply
* Reserved supply
* Confirmed orders
* Pending offers
* Expected revenue
* Payments pending
* Upcoming harvest dates
* Buyer reliability summaries
* Active disputes

Include:

* Harvest calendar
* Allocation overview chart
* Recent buyer offers
* Order status timeline
* Recommended buyers

Buyer Dashboard

Show:

* Active purchase requests
* Matched farms
* Submitted offers
* Confirmed purchases
* Incoming deliveries
* Pending inspections
* Payment obligations
* AgriTrust performance

Include:

* Procurement pipeline chart
* Supply availability chart
* Upcoming delivery calendar
* Recent transaction history

Admin Dashboard

Show:

* Total platform transactions
* Active buyers
* Active farmers
* Confirmed contract value
* Dispute rate
* Payment completion rate
* Average matching time
* Platform activity

Use realistic sample data and functional filters.

⸻

20. Interactive Demo Scenario

Create a fully functional demo using the following fictional scenario.

Farmer

Name: Green Valley Farm

Location: Chanthaburi, Thailand

Product: Mango

Variety: Nam Dok Mai

Expected Harvest: 5,000 kg

Harvest Window: December 15–18, 2026

Buyers

Buyer B:

* Demand: 3,000 kg
* Price: 45 THB/kg
* Trust Score: 92

Buyer C:

* Demand: 2,500 kg
* Price: 48 THB/kg
* Trust Score: 85

Buyer D:

* Demand: 2,000 kg
* Price: 50 THB/kg
* Trust Score: 65

Demo flow

1. Log in as a farmer.
2. Open the dashboard.
3. View the 5,000 kg mango listing.
4. See three interested buyers.
5. Compare buyer offers and AgriTrust profiles.
6. Open Smart Allocation.
7. Allocate 2,000 kg to Buyer B.
8. Allocate 2,000 kg to Buyer C.
9. Allocate 1,000 kg to Buyer D.
10. Review the expected revenue.
11. Confirm the allocation plan.
12. Generate three separate HarvestLock agreements.
13. Simulate buyer acceptance.
14. Generate confirmed orders.
15. Create harvest and delivery records.
16. Generate Lot IDs and QR codes.
17. Simulate quality inspections.
18. Calculate settlements.
19. Simulate payment confirmation.
20. Update verified transaction performance.

Ensure all changes propagate across the application.

For example, after allocating 2,000 kg to Buyer B, the available uncommitted quantity should decrease appropriately.

After confirming a contract, the corresponding order should appear in the Confirmed Orders page.

After QC inspection, the settlement calculation should update automatically.

After a verified payment, the payment status should change and the transaction history should reflect the event.

⸻

21. Technical Architecture

Recommended stack:

Frontend

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod
* Recharts

Backend

* Next.js Server Actions or API routes
* Modular business logic
* Authentication and authorization
* Transaction state machine
* Allocation engine
* Matching engine
* Contract service
* QC service
* Settlement service
* AgriTrust scoring service

Database

* PostgreSQL
* Supabase Auth
* Supabase Storage
* Row-Level Security

Optional integrations

* Maps and geocoding
* Email and SMS notifications
* E-signature provider
* Payment provider
* Digital weighing scale
* Quality inspection sensors

Architecture principles

Start with a modular monolith rather than unnecessary microservices.

Keep business rules separate from UI components.

Use server-side validation for all critical actions.

Use database transactions for inventory reservations and order confirmations.

Use idempotency keys for payment-related operations.

Keep audit records for critical transaction changes.

Protect sensitive personal and business information.

⸻

22. Security and Compliance

Implement:

* Secure authentication
* Role-based access control
* Row-level security
* Input validation
* Rate limiting
* Secure file upload
* Private evidence storage
* Signed file access URLs
* Audit logging
* Contract version history
* Secure document hashing
* Data retention policies

Consider applicable Thai laws and requirements, including electronic transactions, personal data protection, and relevant agricultural quality standards.

Do not claim the application provides guaranteed legal enforceability, fraud prevention, or guaranteed buyer payment.

⸻

23. Build Priorities

Implement the product in phases.

Phase 1 — Functional MVP

Must include:

1. Authentication and role selection
2. Farmer and buyer dashboards
3. Produce listings
4. Purchase requests
5. Matching
6. Buyer offer submission
7. AgriTrust buyer profiles
8. Manual multi-buyer allocation
9. HarvestLock agreements
10. Order status tracking
11. GradeProof inspection records
12. Settlement calculation
13. Transaction history

Phase 2 — Advanced Operations

Add:

* Allocation optimization
* Dynamic reallocation
* QR traceability
* Contract document generation
* Digital signatures
* Dispute management
* Advanced audit logging
* Notifications

Phase 3 — Intelligent Features

Add only when sufficient validated data exists:

* AI-assisted buyer matching
* Quality inspection assistance
* Risk anomaly detection
* Contract explanation assistant
* Harvest forecasting
* Advanced allocation recommendations

⸻

24. Expected Deliverables

Generate a working web application with:

* Responsive frontend
* Functional role-based navigation
* Realistic seeded demo data
* Connected database schema
* Authentication
* Functional CRUD operations
* Interactive allocation planner
* Buyer reliability dashboard
* Digital agreement workflow
* QC inspection workflow
* Payment settlement workflow
* Order state management
* Error handling
* Loading states
* Empty states
* Validation
* Clear setup instructions

Do not leave primary buttons as decorative placeholders.

If a third-party integration is unavailable, implement an explicitly labeled demo simulation rather than pretending the integration works.

Use realistic, connected sample data instead of isolated hardcoded screens.

⸻

25. Critical User Experience Requirements

The most important screen is the End-to-End Ordering Workspace.

Create a visual step-by-step transaction journey showing:

Purchase Request → Matching → Offer → Allocation → HarvestLock → Harvest → Delivery → GradeProof → Settlement → AgriTrust

Each step should be clickable.

Users should be able to see:

* Current stage
* Completed stages
* Pending actions
* Responsible party
* Required documents
* Next available action
* Potential risks
* Related evidence

Provide a clear visual distinction between actions performed by:

* Farmer
* Buyer
* Quality Inspector
* AgriGuard System

Use a timeline or swimlane workflow visualization.

The entire application should make complex agricultural procurement processes understandable to nontechnical users.

⸻

26. Final Instruction to the AI Web Builder

Build AgriGuard as a cohesive, realistic agricultural procurement SaaS application.

Prioritize the following product differentiators:

1. Buyer-First Procurement

Start from real purchasing demand rather than generic product listings.

2. Multi-Buyer Allocation

Allow one farm’s harvest to be distributed across several buyers.

3. Evidence-Based Buyer Reliability

Use verified purchasing behavior to help farmers evaluate buyer risk.

4. Pre-Harvest Contract Assurance

Require clear purchasing terms before harvesting.

5. Contract-to-QC Verification

Compare inspection results with the original purchasing agreement.

6. Complete Transaction Traceability

Connect each purchase request, offer, allocation, contract, delivery, inspection, payment, and dispute into one auditable transaction history.

The final product must feel like a practical operational platform, not a concept presentation.

Start by implementing the complete working MVP with seeded demo data. Focus first on making the core ordering workflow function end to end before adding advanced AI features.