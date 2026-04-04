export const STATUS_PIPELINE = ['pending','emailed','received','written','picked_up'];

export const STATUS_META = {
  pending:   { label: 'Pending',    colour: 'bg-gray-100 text-gray-600'    },
  emailed:   { label: 'Emailed',    colour: 'bg-blue-100 text-blue-700'    },
  received:  { label: 'Received',   colour: 'bg-yellow-100 text-yellow-700'},
  written:   { label: 'Written',    colour: 'bg-orange-100 text-orange-700'},
  picked_up: { label: 'Picked up',  colour: 'bg-green-100 text-green-700'  },
  cancelled: { label: 'Cancelled',  colour: 'bg-red-100 text-red-600'      },
  dropped:   { label: 'Dropped',    colour: 'bg-purple-100 text-purple-700'},
};

export const DELIVERY_LABELS = {
  pickup:   'Pickup',
  dropped:  'Dropped off',
  delivery: 'Delivery',
  pending:  'Pending',
};
