import React, { Suspense } from 'react';
import Calendar from './Calendar';

export default function CalendarPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Calendar />
    </Suspense>
  );
}
