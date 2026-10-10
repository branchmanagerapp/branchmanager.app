import React from 'react';
import { StatusBadge } from './StatusBadge';
import type { InvoiceStatus } from '../models/types';

const VARIANT_MAP: Record<InvoiceStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  partial: 'warning',
  paid: 'success',
  pastDue: 'error',
  overdue: 'error',
  cancelled: 'neutral',
};

const LABEL_MAP: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  partial: 'Partial',
  paid: 'Paid',
  pastDue: 'Past Due',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

interface Props {
  status: InvoiceStatus;
}

export function InvoiceStatusBadge({ status }: Props) {
  return <StatusBadge label={LABEL_MAP[status] || status} variant={VARIANT_MAP[status] || 'neutral'} />;
}
