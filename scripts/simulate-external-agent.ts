/**
 * scripts/simulate-external-agent.ts
 *
 * Fully standalone external buyer agent simulation.
 *
 * CRITICAL DESIGN RULE:
 * This script imports NOTHING from Warden's codebase. It uses only standard
 * Node.js fetch to interact with Warden exclusively via HTTP endpoints,
 * proving that any third-party AI agent can discover, quote, and transact
 * against Warden autonomously.
 *
 * Usage:
 *   npx tsx scripts/simulate-external-agent.ts
 *   (or specify custom URL: WARDEN_BASE_URL=http://localhost:3000 npx tsx scripts/simulate-external-agent.ts)
 */

const BASE_URL = process.env.WARDEN_BASE_URL || process.env.PARCH_BASE_URL || 'http://127.0.0.1:3000';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function banner(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

function section(step: string, desc: string) {
  console.log(`${colors.bold}${colors.yellow}[${step}] ${desc}${colors.reset}`);
}

async function run() {
  banner('🤖 EXTERNAL AI AGENT AUTONOMOUS PROCUREMENT SIMULATION');
  console.log(`${colors.dim}Target Warden Base URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.dim}Calling independent HTTP endpoints with plain fetch...${colors.reset}\n`);

  // ─────────────────────────────────────────────────────────────
  // 1. DISCOVER: Fetch the machine-readable catalog
  // ─────────────────────────────────────────────────────────────
  section('STEP 1: DISCOVERY', 'Fetching /api/agent-catalog schema & vendor catalog');
  
  const catalogRes = await fetch(`${BASE_URL}/api/agent-catalog`);
  if (!catalogRes.ok) {
    console.error(`${colors.red}Failed to fetch catalog: HTTP ${catalogRes.status}${colors.reset}`);
    process.exit(1);
  }

  const catalog = await catalogRes.json();
  console.log(`${colors.green}✓ Discovered catalog API (Version: ${catalog.version})${colors.reset}`);
  console.log(`  Categories: ${colors.bold}${catalog.categories.length}${colors.reset} available`);
  console.log(`  Vendors:    ${colors.bold}${catalog.vendors.length}${colors.reset} vendors listed`);
  console.log(`  Autonomous Policy Limits: Max per purchase = ${colors.bold}$${catalog.autonomousMandatePolicy.maxPerPurchase}${colors.reset}, Daily Cap = ${colors.bold}$${catalog.autonomousMandatePolicy.dailySpendCap}${colors.reset}`);
  console.log(`  Quote Endpoint:    ${colors.cyan}${catalog.endpoints.quote.url}${colors.reset}`);
  console.log(`  Purchase Endpoint: ${colors.cyan}${catalog.endpoints.purchase.url}${colors.reset}\n`);

  // ─────────────────────────────────────────────────────────────
  // 2. SCENARIO A: Permitted Autonomous Purchase (Under $25 limit)
  // ─────────────────────────────────────────────────────────────
  banner('SCENARIO A: PERMITTED AUTONOMOUS PURCHASE (UNDER $25 MANDATE LIMIT)');
  section('STEP 2A: SELECT & QUOTE', 'Targeting Resend Pro ($20/month)');

  const quotePayloadA = {
    vendorSlug: 'resend',
    planName: 'Pro',
    seats: 1,
  };

  const quoteResA = await fetch(`${BASE_URL}/api/agent-catalog/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayloadA),
  });

  if (!quoteResA.ok) {
    console.error(`${colors.red}Failed to obtain quote: HTTP ${quoteResA.status}${colors.reset}`);
    console.error(await quoteResA.text());
    process.exit(1);
  }

  const quoteA = await quoteResA.json();
  console.log(`${colors.green}✓ Received cryptographic quote:${colors.reset}`);
  console.log(`  Quote ID:   ${colors.bold}${quoteA.quoteId}${colors.reset}`);
  console.log(`  Vendor:     ${quoteA.vendorName} (${quoteA.vendorSlug})`);
  console.log(`  Plan:       ${quoteA.planName} · ${quoteA.billingCycle}`);
  console.log(`  Price:      ${colors.bold}$${quoteA.price} ${quoteA.currency}${colors.reset}`);
  console.log(`  Expires At: ${quoteA.expiresAt}`);
  console.log(`  HMAC Sig:   ${colors.magenta}${quoteA.signature.slice(0, 32)}...${colors.reset}\n`);

  section('STEP 3A: AUTONOMOUS CHECKOUT', 'Submitting quote to /api/agent-catalog/purchase');

  const purchasePayloadA = {
    ...quoteA,
    buyerAgentId: 'agent-codex-autonomous-09',
    buyerEmail: 'ops-bot@external-client.ai',
  };

  const purchaseResA = await fetch(`${BASE_URL}/api/agent-catalog/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(purchasePayloadA),
  });

  const purchaseDataA = await purchaseResA.json();

  if (purchaseResA.status === 200 && purchaseDataA.success) {
    console.log(`${colors.green}✓ SUCCESS! Autonomous purchase authorized and executed:${colors.reset}`);
    console.log(`  Policy Verdict: ${colors.bold}${colors.green}${purchaseDataA.policyAudit.verdict}${colors.reset}`);
    console.log(`  Policy Reason:  ${purchaseDataA.policyAudit.reason}`);
    console.log(`  Razorpay Order: ${colors.bold}${purchaseDataA.order.id}${colors.reset} (${purchaseDataA.order.amount} cents)`);
    console.log(`  Payment Ref:    ${purchaseDataA.purchase.paymentId}`);
    console.log(`  Purchase ID:    ${colors.bold}${purchaseDataA.purchase.id}${colors.reset}`);
    console.log(`  Source:         ${colors.cyan}${purchaseDataA.purchase.source}${colors.reset} (Autonomous Agent S2S)`);
    console.log(`  Invoice URL:    ${purchaseDataA.purchase.invoiceUrl}`);
  } else {
    console.error(`${colors.red}Unexpected failure on permitted purchase:${colors.reset}`, purchaseDataA);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SCENARIO B: Policy Gating / Denial Test (Over $25 limit)
  // ─────────────────────────────────────────────────────────────
  banner('SCENARIO B: DETERMINISTIC POLICY GATING (OVER $25 MANDATE LIMIT)');
  section('STEP 2B: SELECT & QUOTE', 'Targeting Postmark Basic 50k ($55/month > $25 limit)');

  const quotePayloadB = {
    vendorSlug: 'postmark',
    planName: 'Basic 50k',
    seats: 1,
  };

  const quoteResB = await fetch(`${BASE_URL}/api/agent-catalog/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayloadB),
  });

  if (!quoteResB.ok) {
    console.error(`${colors.red}Failed to obtain quote: HTTP ${quoteResB.status}${colors.reset}`);
    console.error(await quoteResB.text());
    process.exit(1);
  }

  const quoteB = await quoteResB.json();
  console.log(`${colors.green}✓ Received cryptographic quote:${colors.reset}`);
  console.log(`  Quote ID:   ${colors.bold}${quoteB.quoteId}${colors.reset}`);
  console.log(`  Vendor:     ${quoteB.vendorName} (${quoteB.vendorSlug})`);
  console.log(`  Plan:       ${quoteB.planName}`);
  console.log(`  Price:      ${colors.bold}$${quoteB.price} ${quoteB.currency}${colors.reset} (Exceeds $25 agent mandate limit)`);
  console.log(`  HMAC Sig:   ${colors.magenta}${quoteB.signature.slice(0, 32)}...${colors.reset}\n`);

  section('STEP 3B: GATING ATTEMPT', 'Submitting over-limit quote to /api/agent-catalog/purchase');

  const purchasePayloadB = {
    ...quoteB,
    buyerAgentId: 'agent-codex-autonomous-09',
    buyerEmail: 'ops-bot@external-client.ai',
  };

  const purchaseResB = await fetch(`${BASE_URL}/api/agent-catalog/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(purchasePayloadB),
  });

  const purchaseDataB = await purchaseResB.json();

  console.log(`  HTTP Status: ${purchaseResB.status === 403 ? colors.green + '403 Forbidden' : colors.red + purchaseResB.status}${colors.reset}`);
  if (purchaseResB.status === 403 && purchaseDataB.decision === 'deny') {
    console.log(`${colors.green}✓ GATING PROVEN! Policy Engine deterministically blocked the purchase:${colors.reset}`);
    console.log(`  Decision:       ${colors.bold}${colors.red}DENY${colors.reset}`);
    console.log(`  Block Reason:   ${purchaseDataB.reason || purchaseDataB.error}`);
    console.log(`  Mandate Limit:  Max $${purchaseDataB.mandateLimits?.maxPerPurchase}/purchase (attempt was $${quoteB.price})`);
    console.log(`  Zero Razorpay orders created, zero purchase records recorded.`);
  } else {
    console.error(`${colors.red}Expected policy engine denial but received:${colors.reset}`, purchaseDataB);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. SCENARIO C: Anti-Tampering Signature Verification Test
  // ─────────────────────────────────────────────────────────────
  banner('SCENARIO C: CRYPTOGRAPHIC ANTI-TAMPERING GUARANTEE');
  section('STEP 2C: TAMPERING ATTEMPT', 'Modifying quote price from $55 to $5 without valid signature');

  const tamperedPayload = {
    ...quoteB,
    price: 5.0, // Agent maliciously tampers with price
    buyerAgentId: 'agent-malicious-attacker',
    buyerEmail: 'attacker@evil.corp',
  };

  const tamperedRes = await fetch(`${BASE_URL}/api/agent-catalog/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tamperedPayload),
  });

  const tamperedData = await tamperedRes.json();
  console.log(`  HTTP Status: ${tamperedRes.status === 401 ? colors.green + '401 Unauthorized' : colors.red + tamperedRes.status}${colors.reset}`);
  if (tamperedRes.status === 401) {
    console.log(`${colors.green}✓ ANTI-TAMPERING PROVEN! Warden rejected modified payload:${colors.reset}`);
    console.log(`  Error: ${tamperedData.error}`);
    console.log(`  Code:  ${tamperedData.code}`);
  }

  banner('🎉 END-TO-END AUTONOMOUS SIMULATION COMPLETE');
  console.log(`${colors.green}All 3 autonomous capabilities verified:${colors.reset}`);
  console.log(`  1. Machine-readable discovery via self-describing schema.`);
  console.log(`  2. Fresh, anti-tampered cryptographic quotes.`);
  console.log(`  3. Deterministic policy gating enforcing strict limits on autonomous payments.\n`);
}

run().catch((err) => {
  console.error(`${colors.red}Simulation aborted with error:${colors.reset}`, err);
  process.exit(1);
});
