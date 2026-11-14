export type TxStage = 'SUBMITTED' | 'PENDING' | 'ACCEPTED' | 'FINALIZED_SUCCESS' | 'FINALIZED_ERROR';
export type TxView = { hash: string; status: string; execution: string; consensus: string; stage: TxStage; txReceipt?: string; contractAddress?: string; triggeredTransactions?: string[]; triggeredBy?: string; valueWei?: string; valueCredited?: boolean; from?: string; to?: string };

function named(value: unknown, names: Record<string, string>) {
  const raw = String(value ?? '').toUpperCase();
  return names[raw] ?? raw;
}

export function transactionView(value: unknown): TxView {
  const tx = value as Record<string, unknown>;
  const status = named(tx.statusName ?? tx.status_name ?? tx.status, {
    '0': 'UNINITIALIZED', '1': 'PENDING', '2': 'PROPOSING', '3': 'COMMITTING', '4': 'REVEALING',
    '5': 'ACCEPTED', '6': 'UNDETERMINED', '7': 'FINALIZED',
  });
  const leader = (tx.consensus_data as { leader_receipt?: Array<{ execution_result?: string; vote?: string | null }> } | undefined)?.leader_receipt?.filter((round) => !round.vote).at(-1);
  let execution = named(tx.txExecutionResultName ?? tx.tx_execution_result ?? tx.txExecutionResult ?? leader?.execution_result, {
    '0': 'NOT_VOTED', '1': 'FINISHED_WITH_RETURN', '2': 'FINISHED_WITH_ERROR', SUCCESS: 'FINISHED_WITH_RETURN', ERROR: 'FINISHED_WITH_ERROR',
  });
  let consensus = named(tx.resultName ?? tx.result_name ?? tx.result, {
    '0': 'IDLE', '1': 'AGREE', '2': 'DISAGREE', '3': 'TIMEOUT', '4': 'DETERMINISTIC_VIOLATION',
    '5': 'NO_MAJORITY', '6': 'MAJORITY_AGREE', '7': 'MAJORITY_DISAGREE',
  });
  const credited = tx.value_credited ?? tx.valueCredited;
  const native = (Number(tx.type) === 0 || String(tx.type).toUpperCase() === 'NATIVE') && typeof credited === 'boolean';
  if (native && status === 'FINALIZED') { execution = credited ? 'NATIVE_CREDITED' : 'NATIVE_NOT_CREDITED'; consensus = 'NATIVE_TRANSFER'; }
  const stage: TxStage = status !== 'FINALIZED'
    ? status === 'ACCEPTED' ? 'ACCEPTED' : status === 'UNINITIALIZED' ? 'SUBMITTED' : 'PENDING'
    : native ? credited ? 'FINALIZED_SUCCESS' : 'FINALIZED_ERROR'
    : execution === 'FINISHED_WITH_RETURN' && ['AGREE', 'MAJORITY_AGREE', 'SUCCESS'].includes(consensus)
      ? 'FINALIZED_SUCCESS'
      : 'FINALIZED_ERROR';
  const decoded = tx.txDataDecoded as { contractAddress?: string } | undefined;
  const data = tx.data as { contract_address?: string } | undefined;
  return {
    hash: String(tx.hash ?? tx.txId ?? tx.tx_id ?? ''),
    status,
    execution,
    consensus,
    stage,
    txReceipt: String(tx.txReceipt ?? tx.tx_receipt ?? '') || undefined,
    contractAddress: decoded?.contractAddress ?? data?.contract_address ?? (Number(tx.type) === 1 ? String(tx.to_address ?? tx.recipient ?? '') || undefined : undefined),
    triggeredTransactions: Array.isArray(tx.triggered_transactions ?? tx.triggeredTransactions) ? (tx.triggered_transactions ?? tx.triggeredTransactions) as string[] : [],
    triggeredBy: typeof (tx.triggered_by ?? tx.triggeredBy) === 'string' ? String(tx.triggered_by ?? tx.triggeredBy) : undefined,
    valueWei: tx.value !== undefined ? String(tx.value) : undefined,
    valueCredited: typeof credited === 'boolean' ? credited : undefined,
    from: String(tx.from_address ?? tx.sender ?? tx.from ?? '') || undefined,
    to: String(tx.to_address ?? tx.recipient ?? tx.to ?? '') || undefined,
  };
}
