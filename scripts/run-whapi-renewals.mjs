const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://smartstore-ai.com';
const maintenanceSecret = process.env.MAINTENANCE_SECRET ?? process.env.CRON_SECRET;

if (!maintenanceSecret) {
  console.error('MAINTENANCE_SECRET or CRON_SECRET is required to run Whapi renewals.');
  process.exit(1);
}

const endpoint = new URL('/api/maintenance/whapi-renewals', appUrl.endsWith('/') ? appUrl : `${appUrl}/`);

const response = await fetch(endpoint, {
  headers: {
    Authorization: `Bearer ${maintenanceSecret}`,
  },
  method: 'POST',
});

const body = await response.text();

console.log(`Whapi renewals responded with ${response.status}: ${body}`);

if (!response.ok) {
  process.exit(1);
}
