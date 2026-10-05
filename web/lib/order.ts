// Customers whose "order" is actually an inter-warehouse transfer (doc 19), picked to the
// customer's own warehouse. The bridge routes these by accountKey; the client only needs to
// show the right label / single order-kind option. Mirrors the server's TRANSFER_ACCOUNTS.
export const TRANSFER_ACCOUNTS = new Set(["10830"]);
export const isTransferAccount = (accountKey?: string | null) => !!accountKey && TRANSFER_ACCOUNTS.has(String(accountKey));
