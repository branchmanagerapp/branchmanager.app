import React from 'react';
import { StatusBadge } from './StatusBadge';
import type { QuoteStatus } from '../models/types';

const VARIANT_MAP: Record<QuoteStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  approved: 'success',
  changesRequested: 'warning',
  expired: 'error',
};

const LABEL_MAP: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  approved: 'Approved',
  changesRequested: 'Changes',
  expired: 'Expired',
};

interface Props {
  status: QuoteStatus;
}

export function QuoteStatusBadge({ status }: Props) {
  return <StatusBadge label={LABEL_MAP[status] || status} variant={VARIANT_MAP[status] || 'neutral'} />;
}
