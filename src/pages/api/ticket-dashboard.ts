export const prerender = false;

const FIRST_URL =
  "https://nocodb.yellowstoneqsr.org/api/v3/data/px1ga5r695yvn0t/m70l1rghxqp836u/records?pageSize=1000";

function getRange(range: string) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = now;

  if (range === "last7") start = new Date(now.getTime() - 7 * 86400000);
  if (range === "last30") start = new Date(now.getTime() - 30 * 86400000);
  if (range === "last90") start = new Date(now.getTime() - 90 * 86400000);

  if (range === "currentMonth") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (range === "lastMonth") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
}

async function getAllTickets(token: string) {
  let records: any[] = [];
  let nextUrl: string | null = FIRST_URL;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        "xc-token": token,
      },
    });

    const data: any = await res.json();

    records.push(...(data.records || []));

    nextUrl = data.next || null;
  }

  return records.map((r) => r.fields || r);
}

export async function GET({ request, locals }: any) {
  const token =
    locals?.runtime?.env?.NOCODB_TOKEN || import.meta.env.NOCODB_TOKEN;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "last30";
  const { start, end } = getRange(range);

  const tickets = await getAllTickets(token);

  const isArchived = (t: any) =>
    t.Archived === 1 || t.Archived === true || t.Archived === "1";

  const inRange = (dateValue: string) => {
    if (!start) return true;
    if (!dateValue) return false;

    const d = new Date(dateValue);
    return d >= start && d < end!;
  };

  const openTickets = tickets.filter((t) => !isArchived(t));
  const closedTickets = tickets.filter((t) => isArchived(t));

  const openedInRange = tickets.filter((t) => inRange(t.Created));

  const closedInRange = tickets.filter(
    (t) => isArchived(t) && inRange(t["Last Modified"])
  );

  const oldestOpen = openTickets
    .map((t) => ({
      ticketNumber: t["Ticket Number"],
      store: t["Store Name/Number"],
      created: t.Created,
      daysOpen: Math.floor(
        (Date.now() - new Date(t.Created).getTime()) / 86400000
      ),
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen)[0];

  return new Response(
    JSON.stringify({
      overview: {
        openTickets: openTickets.length,
        closedTickets: closedTickets.length,
        totalTickets: tickets.length,
        oldestOpen,
      },
      performance: {
        opened: openedInRange.length,
        closed: closedInRange.length,
        closeRate:
          openedInRange.length > 0
            ? Math.round((closedInRange.length / openedInRange.length) * 100)
            : 0,
      },
      debug: {
        loadedTickets: tickets.length,
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
