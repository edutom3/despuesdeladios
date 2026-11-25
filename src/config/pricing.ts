export const CASE_PRICE_EUR = 19;
export const CASE_PRICE_LABEL = `${CASE_PRICE_EUR} €`;

export interface PendingCasePayment {
  method: 'stripe' | 'partner_code';
  codeOrReceipt: string;
  partnerName?: string;
  paidAt: string;
}
