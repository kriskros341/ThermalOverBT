"use server";

import { revalidatePath } from 'next/cache';

const PRINTING_SERVICE_URL = process.env.PRINTING_SERVICE_URL || 'http://localhost:8000';

export async function postImageToPrinter(formData: FormData) {
  const file = formData.get('image') as File;
  const options = JSON.parse(formData.get('options') as string);

  console.log("Forwarding print job to printing service...", file.name, options);

  const serviceFormData = new FormData();
  serviceFormData.append('file', file);

  const res = await fetch(`${PRINTING_SERVICE_URL}/print-async`, {
    method: 'POST',
    body: serviceFormData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printing service failed: ${text || res.statusText}`);
  }

  const data = await res.json();
  const job_id = (data as any).job_id as string;

  console.log(`Started print job: ${job_id}`);

  revalidatePath('/image');

  return { job_id };
}
