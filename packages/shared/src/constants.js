export const EXAM_STATUS = {
  PENDING:   'pending',
  EMAILED:   'emailed',
  RECEIVED:  'received',
  WRITTEN:   'written',
  PICKED_UP: 'picked_up',
  CANCELLED: 'cancelled',
  DROPPED:   'dropped',
};

export const STATUS_PIPELINE = [
  'pending', 'emailed', 'received', 'written', 'picked_up',
];

export const EXAM_TYPE = {
  PAPER:       'paper',
  BRIGHTSPACE: 'brightspace',
  CROWDMARK:   'crowdmark',
};

export const DELIVERY_METHOD = {
  PICKUP:   'pickup',
  DROPPED:  'dropped',
  DELIVERY: 'delivery',
  PENDING:  'pending',
};
