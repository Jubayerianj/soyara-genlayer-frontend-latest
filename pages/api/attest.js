// pages/api/attest.js
//
// Signs a settlement commitment that GenLayer consensus has already approved.
//
// WHY THIS EXISTS
// ---------------
// A consensus round DECIDES in about twenty seconds. Settlement waited forty
// minutes anyway, because the verdict travels to the executor as an external
// message and those are delivered only once the appeal window closes. The wait
// was never consensus being slow; it was the delivery road.
//
// This is the other road. The verdict is readable from the Intelligent Contract
// the moment the round is accepted, so attestors read it there and sign the SAME
// commitment under EIP-712. The executor verifies the quorum on chain and
// settles in seconds.
//
// WHAT THIS SERVICE CAN AND CANNOT DO
// -----------------------------------
// It cannot originate an approval. It signs a commitment only after reading a
// recorded verdict for that exact commitment from the IC, and a commitment the
// validators never approved has no verdict to find. If the IC says no, or says
// nothing yet, this refuses.
//
// The honest statement of the trade: settlement authority moves from "the
// validator contract wrote this" to "M of N attestors agree the validator
// contract approved this". That is weaker than the consensus rail. It is also
// far stronger than a single agent key that both authorised and executed, and
// whose approval left the route and the fee for it to choose:
//
//   · the signature covers the WHOLE commitment, route and fee included
//   · it takes M distinct signers
//   · an attestor may never be a settlement agent, enforced on chain
//
// These keys only sign. They never send a transaction, so they hold no funds and
// belong in a separate service or an HSM rather than beside the relayer's key.

import { gatherAttestations } from '../../lib/attest.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { commitment } = req.body || {};
  try {
    const result = await gatherAttestations(commitment);
    if (!result.ok) {
      return res.status(result.status || 409).json({
        error: result.error,
        pending: Boolean(result.pending),
      });
    }
    return res.status(200).json({
      commitment,
      threshold: result.threshold,
      attestors: result.attestors,
      attestations: result.attestations,
      verdictReason: result.verdictReason,
    });
  } catch (err) {
    console.error('[attest] failed:', err);
    return res.status(500).json({ error: err?.shortMessage || err?.message || 'Attestation failed' });
  }
}
