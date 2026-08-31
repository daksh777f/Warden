# Warden

<div align="center">

**Bounded, gated, autonomous commerce for AI agents.**

*Designed & Engineered by **[Daksh Goel](https://github.com/)***

[![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Payment_Stack-02042B?style=for-the-badge&logo=razorpay&logoColor=3395FF)](https://razorpay.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Responses_API-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Security](https://img.shields.io/badge/Security-HMAC--SHA256_Gated-059669?style=for-the-badge&logo=shield&logoColor=white)](#the-inviolable-safety-guarantee)

<br/>

[Framework Architecture](#-system-framework-architecture) •
[Transaction Lifecycle](#-transaction-lifecycle-workflow) •
[What Makes Warden Stand Out](#-what-makes-warden-stand-out) •
[Benchmarks](#-benchmarks--telemetry) •
[Dual Reasoning Models](#-dual-reasoning-models--trust-engine) •
[Use Cases](#-real-world-use-cases) •
[Quickstart](#-quickstart--local-execution)

---

</div>

##  Executive Summary

Modern AI agents can write code, draft legal briefs, and configure cloud infrastructure — but when it comes to **spending real money**, the industry has offered only two bad extremes:
1. **Unconstrained API keys:** Giving an LLM direct access to credit cards or wallet private keys, inviting catastrophic prompt injection or runaway hallucinated transactions.
2. **Passive link drops:** Reducing the AI to a glorified search engine that throws affiliate links into chat for humans to research, configure, and purchase manually.

**Warden introduces a third paradigm: Bounded, Gated, Autonomous Commerce.**

Warden acts as an autonomous procurement employee for startups. It independently researches vendors, cross-examines pricing matrices, verifies merchant credibility via trust models, and formulates defensible purchase proposals. 

Critically, financial authorization is **never delegated to the stochastic LLM**. Purchases are governed by a **deterministic, in-memory policy engine** that enforces hard daily spend caps, per-transaction limits, price-drift thresholds, and cryptographic HMAC signing. Autonomous agents can transact freely within strict bounds, while risky operations trigger instantaneous human-in-the-loop escalations.

---

## 🏛️ System Framework Architecture

Warden is architected as an end-to-end multi-layer stack separating **agent reasoning**, **governance policy**, **payment settlement**, and **cryptographic audit logging**:

```mermaid
flowchart TD
  %% Custom Theme Palette
  classDef ingress fill:#0c4a6e,stroke:#38bdf8,stroke-width:2px,color:#f0f9ff;
  classDef reasoning fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#eef2ff;
  classDef tools fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;
  classDef policy fill:#581c87,stroke:#c084fc,stroke-width:2px,color:#faf5ff;
  classDef settlement fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#fffbeb;
  classDef ledger fill:#134e4a,stroke:#2dd4bf,stroke-width:2px,color:#f0fdfa;
  classDef hub fill:#831843,stroke:#fb7185,stroke-width:3px,color:#fff1f2;

  subgraph S1 ["🌐 1. Ingress & Client Surfaces"]
    UI["🖥️ Next.js 15 Web App<br/><b>Dashboard • Chat • Purchases • Settings</b>"]:::ingress
    AuditUI["📜 Cryptographic Audit Ledger<br/><b>/audit & Live Telemetry</b>"]:::ingress
    S2S["🤖 External AI Agents<br/><b>M2M Discovery & S2S API</b>"]:::ingress
    SMS["📱 Linq iMessage / SMS<br/><b>Out-of-band Approvals</b>"]:::ingress
  end

  subgraph S2 ["🧠 2. Dual Reasoning & Tool Suite"]
    Orchestrator{"⚡ Reasoning Dispatcher"}:::hub
    LLM["🧠 OpenAI Responses API<br/><b>Multi-turn GPT-4o Agent</b>"]:::reasoning
    Scripted["⚡ Deterministic Agent<br/><b>&lt; 2.5s Zero-Latency Fallback</b>"]:::reasoning
    
    subgraph S2_Tools ["🛠️ Discrete Toolbelt"]
      T1["🔍 searchVendors"]:::tools
      T2["📊 fetchPricing"]:::tools
      T3["🛡️ checkMerchantTrust (Senso 50/50)"]:::tools
      T4["⚖️ compareOptions"]:::tools
      T5["🎯 createRecommendation"]:::tools
      T6["💡 suggestOptimization (Upsell)"]:::tools
    end
  end

  subgraph S3 ["⚖️ 3. Deterministic Policy Engine"]
    Engine{"🛡️ Spending Policy Evaluator"}:::hub
    R1["💵 Max Per Purchase ($100)"]:::policy
    R2["📈 Daily Spend Velocity ($300)"]:::policy
    R3["⚡ Auto-Approval Limit ($30)"]:::policy
    R4["📉 Price Drift Detection (&gt; 5%)"]:::policy
    R5["🚨 Global Safety Kill-Switch"]:::policy
  end

  subgraph S4 ["💳 4. Razorpay Settlement Layer"]
    OrderGen["📦 Razorpay Orders API<br/><b>Test Mode Sandbox & S2S</b>"]:::settlement
    Checkout["💳 Checkout.js Modal<br/><b>PCI-DSS Compliant</b>"]:::settlement
    WebhookRecv["🔐 Webhook Signature Verifier<br/><b>HMAC-SHA256</b>"]:::settlement
    FailRecov["🔄 Scripted Failure Recovery<br/><b>1-Click Idempotent Retry</b>"]:::settlement
  end

  subgraph S5 ["🔏 5. Cryptographic Storage & Ledger"]
    Proof["🔏 HMAC-SHA256 Token Engine"]:::ledger
    StoreDriver{"💾 Unified Store Driver"}:::hub
    PG["🐘 Supabase PostgreSQL"]:::ledger
    Disk["📁 Atomic File Store (.data/)"]:::ledger
  end

  %% Ingress Connections
  UI -->|"1. User Request"| Orchestrator
  S2S -->|"M2M Discovery & Quote"| Proof
  Proof -->|"Signed Quote Purchase"| Engine
  SMS -.->|"Out-of-band Action"| UI

  %% Agent Reasoning Connections
  Orchestrator --> LLM
  Orchestrator --> Scripted
  LLM --> S2_Tools
  Scripted --> S2_Tools
  S2_Tools -->|"Structured Proposal"| Engine

  %% Policy Gating Decisions
  Engine -->|"Auto-Allow (&le; $30)"| OrderGen
  Engine -->|"Require Human (&gt; $30)"| UI
  Engine -->|"Price Drift Re-approval"| UI
  Engine -->|"Deny Blocked Spend"| AuditUI

  %% Settlement Flow
  UI -->|"Human Approved Click"| OrderGen
  OrderGen --> Checkout
  Checkout --> WebhookRecv
  WebhookRecv --> FailRecov
  WebhookRecv --> StoreDriver

  %% Persistence
  FailRecov --> StoreDriver
  StoreDriver --> PG
  StoreDriver --> Disk
  StoreDriver --> AuditUI
```

---

## Transaction Lifecycle Workflow

Warden routes every procurement request through a state machine that guarantees zero unauthorized charges while enabling machine-speed autonomous execution:

```mermaid
sequenceDiagram
  autonumber
  actor User as Buyer / External Agent
  participant Chat as Warden Interface
  participant Agent as Agent Reasoning Engine
  participant Tools as Catalog & Trust Tools
  participant Policy as Deterministic Policy Engine
  participant Razorpay as Razorpay Payment Stack
  participant Ledger as Cryptographic Audit Ledger

  User->>Chat: "Procure error monitoring under $30/mo"
  Chat->>Agent: Dispatch Intent & Context
  activate Agent
  Agent->>Tools: searchVendors("error monitoring")
  Tools-->>Agent: Sentry ($26), Bugsnag ($39)
  Agent->>Tools: checkMerchantTrust("sentry")
  Tools-->>Agent: Senso Trust Score: 95/100
  Agent->>Tools: suggestOptimization(Sentry, "team")
  Tools-->>Agent: Optimization Analysis (Annual Savings / Features)
  Agent->>Chat: Stream Research Cards & Recommendation
  deactivate Agent

  Chat->>Policy: evaluatePurchase(price: $26, vendor: "Sentry")
  activate Policy
  Note over Policy: Checks Max Purchase ($100),<br/>Daily Spend Cap ($300),<br/>Auto-Approval Limit ($30)
  alt Price within Auto-Approval Limit ($26 vs $30)
    Policy-->>Chat: Status: AUTO_ALLOW (Deterministic Pass)
  else Exceeds Auto-Approval Limit ($49 vs $30)
    Policy-->>Chat: Status: REQUIRE_HUMAN (Escalation Triggered)
  else Price Drift Detected (above 5% Catalog Variance)
    Policy-->>Chat: Status: REAPPROVE (Requires Price Acceptance)
  else Exceeds Hard Mandate ($150 vs $100)
    Policy-->>Chat: Status: DENIED (Hard Block — No Order Created)
  end
  deactivate Policy

  alt Auto-Allowed or Human Approved
    Chat->>Razorpay: POST /api/approvals/[id] (Create Order)
    Razorpay-->>Chat: Return order_id & subunit amount
    Chat->>Razorpay: Mount Checkout.js / S2S Capture
    Razorpay-->>Chat: Razorpay Payment Signature
    Chat->>Razorpay: POST /api/razorpay/verify (HMAC Verification)
    Razorpay-->>Ledger: Record Event: captured (payment_id)
    Ledger-->>Chat: Output cryptographically signed invoice OPS-2026-XXXX
  else Payment Failure Encountered
    Razorpay-->>Chat: Webhook: payment.failed
    Chat->>Ledger: Record Failure Reason in Audit Trace
    Chat->>User: Render 1-Click "Retry Payment" Recovery Card
  end
```

---

## What Makes Warden Stand Out

### 1. The Inviolable Safety Guarantee
> **The LLM agent has literally zero payment tools in its execution belt.**

The agent's tool catalog is strictly limited to:
- `searchVendors` (Catalog lookup)
- `fetchPricing` (Matrix extraction)
- `checkMerchantTrust` (Senso + local heuristic blending)
- `compareOptions` (Normalization & comparison)
- `createRecommendation` (Synthesis)
- `suggestOptimization` (Upsell calculus)

There is **no function that charges money**. Money moves exclusively when:
1. A human clicks **Approve** in the browser, triggering `POST /api/approvals/[id]`.
2. The **Deterministic Policy Engine** evaluates the purchase against pre-configured company rules and auto-allows it within cryptographic caps.

### 2. Deterministic Policy Engine (Code, Not Prompts)
Unlike naive agent wrappers that instruct the LLM: *"Please do not spend more than $100"*, Warden implements spending governance in pure, deterministic TypeScript code:
- **`maxPerPurchase`**: Hard ceiling on any individual charge.
- **`dailyCap`**: Real-time spend velocity calculation tracking 24-hour authorized volume.
- **`autoApprovalLimit`**: Low-risk threshold enabling true autonomous execution without nagging humans.
- **`priceDriftThreshold` (5%)**: Compares the quoted rate against live catalog prices. If a vendor raises prices between proposal and checkout, Warden flags the drift and halts execution.
- **`active` Safety Switch**: Instant one-click global kill-switch that escalates 100% of purchases to human review.

### 3. Machine-to-Machine Autonomous Commerce (Phase 4)
Warden exposes its entire vendor ecosystem to external, third-party AI agents via a self-describing JSON Schema API (`GET /api/agent-catalog`). 
- **Cryptographic Quotes**: External agents request signed quotes (`POST /api/agent-catalog/quote`) bound by timestamp and HMAC-SHA256 signatures.
- **Anti-Tampering Verification**: If an external agent modifies the quote (e.g. altering `$55` to `$5`), Warden's cryptographic verifier rejects the payload with `401 Unauthorized` in **under 0.5 milliseconds**.
- **Autonomous S2S Settlement**: Permitted purchases settle directly server-to-server via Razorpay without browser checkout.

### 4. Honest Mathematical Upsells (Phase 5)
Upselling in Warden is grounded in strict numeric logic, never vague marketing fluff. When an agent recommends a tool, `suggestOptimization` evaluates exactly two paths:
- **Annual Discount Optimization**: Calculates exact monthly savings, annual savings, and breakeven horizon (e.g., *"$4/mo cheaper on annual billing, saves $48/yr, breakeven at 10 months"*).
- **Feature-Tier Upgrade**: Scans customer requirements against catalog tier feature matrices (e.g., *"+$9/user/mo unlocks Audit Logs and Org-wide policy management"*).
- If no upgrade provides demonstrable ROI, the tool returns `null` rather than manufacturing an upsell.

### 5. Scripted Failure Recovery & Immutable Audit Trail (Phase 3)
When real-world payments fail (insufficient funds, gateway timeouts, expired mandates):
- Warden catches the signed Razorpay `payment.failed` webhook.
- The failure reason is immutably logged into the cryptographic audit trail ledger.
- A **1-Click Failure Recovery** mechanism allows administrators to retry the payment instantly without duplicate charges or orphaned subscriptions.

---

##  Benchmarks & Telemetry

Tested on local and production environments across deterministic and LLM workflows:

| Operation | Latency | Determinism | Security Model | Notes |
|:---|:---:|:---:|:---:|:---|
| **Deterministic Scripted Agent** | **&lt; 2.5s** | 100% Deterministic | Zero network calls | Executes all 6 tools sequentially; ideal for instant demos |
| **OpenAI GPT-4o Agent Loop** | **8 – 14s** | Stochastic Reasoning | SSE Streamed | 5 sequential multi-turn tool calls with trade-off synthesis |
| **Autonomous M2M S2S Purchase** | **~1.5s** | 100% Deterministic | HMAC-SHA256 + S2S | End-to-end quote verification + policy check + Razorpay order |
| **Policy Engine Evaluation** | **&lt; 1ms** | 100% Deterministic | In-Memory Code | Zero I/O overhead; verifies spend velocity & drift |
| **HMAC Signature Check** | **&lt; 0.5ms** | 100% Deterministic | SHA-256 Crypto | Immediate rejection of tampered external agent payloads |
| **Failure Recovery Retries** | **~2.1s** | 100% Idempotent | Atomic Replacement | Re-issues fresh order; maintains historical failure record |

---

## Dual Reasoning Models & Trust Engine

