/**
 * positionIngest.test.ts
 *
 * Unit tests for the Position Desk ingest paths in positionClient.ts.
 *
 * Covers all 10 scenarios:
 *   1.  createPosition  -- mapToPositionRow maps flow_type -> type correctly in response
 *   2.  createPosition  -- payload sends flow_type (not type) to the API
 *   3.  createPosition  -- sets created_at and updated_at from API response
 *   4.  updatePosition  -- payload maps type -> flow_type and sends correct fields
 *   5.  updatePosition  -- returns updated PositionRow with correct lifecycle fields
 *   6.  deletePosition  -- calls DELETE /v1/positions/{id} with correct headers
 *   7.  listPositions   -- filters by status/currency/flow_type via query params
 *   8.  importPositionsCsv -- sends FormData with file field
 *   9.  executePosition -- calls PATCH /execute with execution_ref
 *  10.  mapToPositionRow -- all fields (including created_at, updated_at, null
 *                           lifecycle fields) mapped correctly from raw API response
 */

import axios from "axios";
import {
  createPosition,
  updatePosition,
  deletePosition,
  listPositions,
  importPositionsCsv,
  executePosition,
} from "../../api/positionClient";
import type { PositionRow } from "../../api/positionClient";
import type { TradeRow } from "../../api/types";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TRADE_ROW: TradeRow = {
  record_id:   "REC-001",
  entity:      "ACME Corp",
  type:        "AR",
  currency:    "EUR",
  amount:      50_000,
  value_date:  "2026-06-30",
  status:      "CONFIRMED",
  description: "Invoice payment",
};

const RAW_API_POSITION = {
  id:               "pos-uuid-1234",
  record_id:        "REC-001",
  entity:           "ACME Corp",
  flow_type:        "AR",
  currency:         "EUR",
  amount:           50_000,
  value_date:       "2026-06-30",
  status:           "CONFIRMED",
  description:      "Invoice payment",
  created_at:       "2026-01-15T09:00:00Z",
  updated_at:       "2026-01-15T10:30:00Z",
  execution_status: "NEW",
  policy_id:        null,
  last_run_id:      null,
  executed_at:      null,
  execution_ref:    null,
  hedge_amount:     null,
  hedge_rate:       null,
  rejection_reason: null,
};

beforeEach(() => { jest.resetAllMocks(); });

// ===========================================================================
// Scenario 1 -- createPosition: flow_type -> type mapping in response
// ===========================================================================

describe("createPosition -- field mapping flow_type to type", () => {
  test("maps flow_type AP from API response to type AP on the PositionRow", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ...RAW_API_POSITION, flow_type: "AP" } });
    const result: PositionRow = await createPosition({ ...TRADE_ROW, type: "AP" });
    expect(result.type).toBe("AP");
  });

  test("maps flow_type AR from API response to type AR on the PositionRow", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result: PositionRow = await createPosition(TRADE_ROW);
    expect(result.type).toBe("AR");
  });

  test("returned PositionRow does NOT contain a raw flow_type key", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result = await createPosition(TRADE_ROW) as unknown as Record<string, unknown>;
    expect(result).not.toHaveProperty("flow_type");
  });
});

// ===========================================================================
// Scenario 2 -- createPosition: payload sends flow_type (not type) to API
// ===========================================================================

describe("createPosition -- outbound payload shape", () => {
  test("sends flow_type in the POST body instead of type", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition(TRADE_ROW, "tok-abc");
    const [, sentPayload] = mockedAxios.post.mock.calls[0];
    expect(sentPayload).toHaveProperty("flow_type", "AR");
    expect(sentPayload).not.toHaveProperty("type");
  });

  test("payload contains all required fields with correct values", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition(TRADE_ROW, "tok-abc");
    const [, sentPayload] = mockedAxios.post.mock.calls[0];
    expect(sentPayload).toMatchObject({
      record_id:   "REC-001",
      entity:      "ACME Corp",
      flow_type:   "AR",
      currency:    "EUR",
      amount:      50_000,
      value_date:  "2026-06-30",
      status:      "CONFIRMED",
      description: "Invoice payment",
    });
  });

  test("sends POST to a URL ending in /v1/positions", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition(TRADE_ROW, "tok-abc");
    const [url] = mockedAxios.post.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions$/);
  });

  test("includes X-API-Key header in the POST request", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition(TRADE_ROW, "tok-abc");
    const [, , config] = mockedAxios.post.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers).toHaveProperty("X-API-Key");
    expect(typeof headers["X-API-Key"]).toBe("string");
  });

  test("includes Authorization Bearer header when token is supplied", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition(TRADE_ROW, "tok-bearer-xyz");
    const [, , config] = mockedAxios.post.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("Bearer tok-bearer-xyz");
  });

  test("description is sent as null when empty string is provided", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await createPosition({ ...TRADE_ROW, description: "" }, "tok");
    const [, sentPayload] = mockedAxios.post.mock.calls[0];
    expect((sentPayload as Record<string, unknown>).description).toBeNull();
  });
});

// ===========================================================================
// Scenario 3 -- createPosition: sets created_at and updated_at from API response
// ===========================================================================

describe("createPosition -- audit timestamp mapping", () => {
  test("created_at matches the API response value", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result = await createPosition(TRADE_ROW);
    expect(result.created_at).toBe("2026-01-15T09:00:00Z");
  });

  test("updated_at matches the API response value", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result = await createPosition(TRADE_ROW);
    expect(result.updated_at).toBe("2026-01-15T10:30:00Z");
  });

  test("created_at and updated_at are null when the API omits the fields", async () => {
    const r = { ...RAW_API_POSITION, created_at: undefined, updated_at: undefined };
    mockedAxios.post.mockResolvedValueOnce({ data: r });
    const result = await createPosition(TRADE_ROW);
    expect(result.created_at).toBeNull();
    expect(result.updated_at).toBeNull();
  });
});

// ===========================================================================
// Scenario 4 -- updatePosition: payload maps type -> flow_type
// ===========================================================================

describe("updatePosition -- outbound payload shape", () => {
  test("maps type to flow_type in the PUT body", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: { ...RAW_API_POSITION, flow_type: "AP" } });
    await updatePosition("pos-uuid-1234", { type: "AP" }, "tok");
    const [, sentPayload] = mockedAxios.put.mock.calls[0];
    expect(sentPayload).toHaveProperty("flow_type", "AP");
    expect(sentPayload).not.toHaveProperty("type");
  });

  test("omits fields absent from the partial trade input", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await updatePosition("pos-uuid-1234", { amount: 75_000 }, "tok");
    const [, sentPayload] = mockedAxios.put.mock.calls[0];
    expect(Object.keys(sentPayload as object)).toEqual(["amount"]);
  });

  test("sends all provided partial fields correctly", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await updatePosition("pos-uuid-1234", { type: "AR", currency: "GBP", amount: 10_000, status: "FORECAST" }, "tok");
    const [, sentPayload] = mockedAxios.put.mock.calls[0];
    expect(sentPayload).toMatchObject({ flow_type: "AR", currency: "GBP", amount: 10_000, status: "FORECAST" });
  });

  test("sends PUT to a URL containing the position ID", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await updatePosition("pos-uuid-1234", { amount: 1000 }, "tok");
    const [url] = mockedAxios.put.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions\/pos-uuid-1234$/);
  });

  test("description is coerced to null when empty string is provided", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    await updatePosition("pos-uuid-1234", { description: "" }, "tok");
    const [, sentPayload] = mockedAxios.put.mock.calls[0];
    expect((sentPayload as Record<string, unknown>).description).toBeNull();
  });
});

// ===========================================================================
// Scenario 5 -- updatePosition: returns updated PositionRow with lifecycle fields
// ===========================================================================

describe("updatePosition -- returned PositionRow lifecycle fields", () => {
  test("returns PositionRow with the id from the API response", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result = await updatePosition("pos-uuid-1234", { amount: 60_000 });
    expect(result.id).toBe("pos-uuid-1234");
  });

  test("returns execution_status from the API response", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: { ...RAW_API_POSITION, execution_status: "READY_TO_EXECUTE" } });
    const result = await updatePosition("pos-uuid-1234", { amount: 60_000 });
    expect(result.execution_status).toBe("READY_TO_EXECUTE");
  });

  test("returns fully-populated lifecycle fields from the API response", async () => {
    const updatedRaw = {
      ...RAW_API_POSITION,
      execution_status: "HEDGED", policy_id: "pol-999", last_run_id: "run-888",
      executed_at: "2026-02-01T08:00:00Z", execution_ref: "EX-REF-001",
      hedge_amount: 48_500, hedge_rate: 1.085,
    };
    mockedAxios.put.mockResolvedValueOnce({ data: updatedRaw });
    const result = await updatePosition("pos-uuid-1234", { amount: 60_000 });
    expect(result.policy_id).toBe("pol-999");
    expect(result.last_run_id).toBe("run-888");
    expect(result.executed_at).toBe("2026-02-01T08:00:00Z");
    expect(result.execution_ref).toBe("EX-REF-001");
    expect(result.hedge_amount).toBe(48_500);
    expect(result.hedge_rate).toBe(1.085);
  });

  test("null lifecycle fields remain null in the returned PositionRow", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: RAW_API_POSITION });
    const result = await updatePosition("pos-uuid-1234", { amount: 60_000 });
    expect(result.policy_id).toBeNull();
    expect(result.last_run_id).toBeNull();
    expect(result.executed_at).toBeNull();
    expect(result.execution_ref).toBeNull();
    expect(result.hedge_amount).toBeNull();
    expect(result.hedge_rate).toBeNull();
    expect(result.rejection_reason).toBeNull();
  });

  test("returned type is correctly translated from flow_type in the PUT response", async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: { ...RAW_API_POSITION, flow_type: "AP" } });
    const result = await updatePosition("pos-uuid-1234", { type: "AP" });
    expect(result.type).toBe("AP");
  });
});

// ===========================================================================
// Scenario 6 -- deletePosition: correct URL and headers
// ===========================================================================

describe("deletePosition", () => {
  test("calls DELETE on the correct URL with the position id", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deletePosition("pos-del-999", "tok-del");
    const [url] = mockedAxios.delete.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions\/pos-del-999$/);
  });

  test("includes X-API-Key header in the DELETE request", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deletePosition("pos-del-999", "tok-del");
    const [, config] = mockedAxios.delete.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers).toHaveProperty("X-API-Key");
  });

  test("includes Authorization Bearer header when token is supplied", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deletePosition("pos-del-999", "my-token");
    const [, config] = mockedAxios.delete.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  test("resolves without returning a value (void)", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    const result = await deletePosition("pos-del-999");
    expect(result).toBeUndefined();
  });

  test("DELETE is called exactly once per invocation", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deletePosition("pos-del-999");
    expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Scenario 7 -- listPositions: query parameter forwarding
// ===========================================================================

describe("listPositions -- query parameter forwarding", () => {
  const LIST_RESPONSE = { items: [RAW_API_POSITION], total: 1 };

  test("sends status filter as a query param", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: LIST_RESPONSE });
    await listPositions("tok", { status: "CONFIRMED" });
    const [url] = mockedAxios.get.mock.calls[0];
    expect(url).toContain("status=CONFIRMED");
  });

  test("sends currency filter as a query param", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: LIST_RESPONSE });
    await listPositions("tok", { currency: "EUR" });
    const [url] = mockedAxios.get.mock.calls[0];
    expect(url).toContain("currency=EUR");
  });

  test("sends flow_type filter as a query param", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: LIST_RESPONSE });
    await listPositions("tok", { flow_type: "AP" });
    const [url] = mockedAxios.get.mock.calls[0];
    expect(url).toContain("flow_type=AP");
  });

  test("sends all three filters simultaneously", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: LIST_RESPONSE });
    await listPositions("tok", { status: "FORECAST", currency: "GBP", flow_type: "AR" });
    const [url] = mockedAxios.get.mock.calls[0];
    expect(url).toContain("status=FORECAST");
    expect(url).toContain("currency=GBP");
    expect(url).toContain("flow_type=AR");
  });

  test("omits query string entirely when no filters are passed", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: LIST_RESPONSE });
    await listPositions("tok");
    const [url] = mockedAxios.get.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions$/);
    expect(url).not.toContain("?");
  });

  test("maps each item through mapToPositionRow (flow_type -> type)", async () => {
    const multi = {
      items: [
        { ...RAW_API_POSITION, id: "pos-1", flow_type: "AR" },
        { ...RAW_API_POSITION, id: "pos-2", flow_type: "AP" },
      ],
      total: 2,
    };
    mockedAxios.get.mockResolvedValueOnce({ data: multi });
    const { items, total } = await listPositions("tok");
    expect(total).toBe(2);
    expect(items[0].type).toBe("AR");
    expect(items[1].type).toBe("AP");
    expect((items[0] as unknown as Record<string, unknown>).flow_type).toBeUndefined();
  });

  test("returns the total count from the API response", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [], total: 42 } });
    const { total } = await listPositions("tok");
    expect(total).toBe(42);
  });
});

// ===========================================================================
// Scenario 8 -- importPositionsCsv: FormData / multipart upload
// ===========================================================================

describe("importPositionsCsv -- FormData multipart upload", () => {
  const CSV_CONTENT = "record_id,entity,flow_type\nREC-001,ACME,AR";
  const IMPORT_RESULT = { created: 1, errors: [], total_rows: 1 };

  function makeFile(name = "positions.csv", content = CSV_CONTENT): File {
    return new File([content], name, { type: "text/csv" });
  }

  test("calls POST on the /v1/positions/import endpoint", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: IMPORT_RESULT });
    await importPositionsCsv(makeFile());
    const [url] = mockedAxios.post.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions\/import$/);
  });

  test("sends a FormData instance as the POST body", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: IMPORT_RESULT });
    await importPositionsCsv(makeFile());
    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
  });

  test("FormData contains the file under the file key", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: IMPORT_RESULT });
    const csvFile = makeFile("export.csv");
    await importPositionsCsv(csvFile);
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as FormData).get("file")).toBe(csvFile);
  });

  test("returns the ImportResult from the API response", async () => {
    const apiResult = { created: 5, errors: [{ row: 3, error: "Bad date" }], total_rows: 6 };
    mockedAxios.post.mockResolvedValueOnce({ data: apiResult });
    const result = await importPositionsCsv(makeFile());
    expect(result.created).toBe(5);
    expect(result.total_rows).toBe(6);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: "Bad date" });
  });

  test("includes X-API-Key header on the import POST request", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: IMPORT_RESULT });
    await importPositionsCsv(makeFile(), "tok-import");
    const [, , config] = mockedAxios.post.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers).toHaveProperty("X-API-Key");
  });
});

// ===========================================================================
// Scenario 9 -- executePosition: PATCH /execute with execution_ref
// ===========================================================================

describe("executePosition -- PATCH lifecycle transition", () => {
  const EXECUTED_RAW = {
    ...RAW_API_POSITION,
    execution_status: "HEDGED",
    execution_ref:    "EX-TRD-5678",
    executed_at:      "2026-02-10T14:00:00Z",
    hedge_amount:     49_000,
    hedge_rate:       1.09,
  };

  test("calls PATCH on the correct /execute URL", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    await executePosition("pos-exec-001", "EX-TRD-5678", undefined, undefined, "tok");
    const [url] = mockedAxios.patch.mock.calls[0];
    expect(url).toMatch(/\/v1\/positions\/pos-exec-001\/execute$/);
  });

  test("sends execution_ref in the PATCH body", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    await executePosition("pos-exec-001", "EX-TRD-5678", undefined, undefined, "tok");
    const [, body] = mockedAxios.patch.mock.calls[0];
    expect(body).toHaveProperty("execution_ref", "EX-TRD-5678");
  });

  test("sends hedge_amount and hedge_rate in PATCH body when provided", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    await executePosition("pos-exec-001", "EX-TRD-5678", 49_000, 1.09, "tok");
    const [, body] = mockedAxios.patch.mock.calls[0];
    expect(body).toMatchObject({ execution_ref: "EX-TRD-5678", hedge_amount: 49_000, hedge_rate: 1.09 });
  });

  test("sends hedge_amount and hedge_rate as null when not provided", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    await executePosition("pos-exec-001", "EX-TRD-5678");
    const [, body] = mockedAxios.patch.mock.calls[0];
    expect((body as Record<string, unknown>).hedge_amount).toBeNull();
    expect((body as Record<string, unknown>).hedge_rate).toBeNull();
  });

  test("returns a PositionRow with execution_status HEDGED", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    const result = await executePosition("pos-exec-001", "EX-TRD-5678");
    expect(result.execution_status).toBe("HEDGED");
  });

  test("returns a PositionRow with the correct execution_ref", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    const result = await executePosition("pos-exec-001", "EX-TRD-5678");
    expect(result.execution_ref).toBe("EX-TRD-5678");
  });

  test("includes Authorization Bearer header when token is provided", async () => {
    mockedAxios.patch.mockResolvedValueOnce({ data: EXECUTED_RAW });
    await executePosition("pos-exec-001", "EX-TRD-5678", undefined, undefined, "bearer-tok");
    const [, , config] = mockedAxios.patch.mock.calls[0];
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("Bearer bearer-tok");
  });
});

// ===========================================================================
// Scenario 10 -- mapToPositionRow: complete field mapping from raw API response
// (exercised indirectly via createPosition with a fully-populated raw object)
// ===========================================================================

describe("mapToPositionRow -- complete field mapping from raw API response", () => {
  const FULLY_POPULATED_RAW = {
    id:               "pos-full-001",
    record_id:        "REC-FULL",
    entity:           "Beta Ltd",
    flow_type:        "AP",
    currency:         "JPY",
    amount:           "1000000",
    value_date:       "2026-09-30",
    status:           "FORECAST",
    description:      "License fee",
    created_at:       "2026-03-01T00:00:00Z",
    updated_at:       "2026-03-02T12:00:00Z",
    execution_status: "POLICY_ASSIGNED",
    policy_id:        "pol-001",
    last_run_id:      "run-001",
    executed_at:      null,
    execution_ref:    null,
    hedge_amount:     "980000",
    hedge_rate:       "148.5",
    rejection_reason: null,
  };

  test("id is mapped from the API id field", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.id).toBe("pos-full-001");
  });

  test("record_id is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.record_id).toBe("REC-FULL");
  });

  test("entity is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.entity).toBe("Beta Ltd");
  });

  test("type is AP (translated from flow_type AP)", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.type).toBe("AP");
  });

  test("currency is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.currency).toBe("JPY");
  });

  test("amount is coerced to number even when API returns a string", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.amount).toBe(1_000_000);
    expect(typeof result.amount).toBe("number");
  });

  test("value_date is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.value_date).toBe("2026-09-30");
  });

  test("status is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.status).toBe("FORECAST");
  });

  test("description is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.description).toBe("License fee");
  });

  test("created_at is preserved as ISO string", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.created_at).toBe("2026-03-01T00:00:00Z");
  });

  test("updated_at is preserved as ISO string", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.updated_at).toBe("2026-03-02T12:00:00Z");
  });

  test("execution_status is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.execution_status).toBe("POLICY_ASSIGNED");
  });

  test("policy_id is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.policy_id).toBe("pol-001");
  });

  test("last_run_id is preserved", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.last_run_id).toBe("run-001");
  });

  test("executed_at is null when API returns null", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.executed_at).toBeNull();
  });

  test("execution_ref is null when API returns null", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.execution_ref).toBeNull();
  });

  test("hedge_amount is coerced to number from string API response", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.hedge_amount).toBe(980_000);
    expect(typeof result.hedge_amount).toBe("number");
  });

  test("hedge_rate is coerced to number from string API response", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.hedge_rate).toBe(148.5);
    expect(typeof result.hedge_rate).toBe("number");
  });

  test("rejection_reason is null when API returns null", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FULLY_POPULATED_RAW });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.rejection_reason).toBeNull();
  });

  test("execution_status defaults to NEW when API omits the field", async () => {
    const rawWithoutStatus = { ...FULLY_POPULATED_RAW, execution_status: undefined };
    mockedAxios.post.mockResolvedValueOnce({ data: rawWithoutStatus });
    const result = await createPosition({ ...TRADE_ROW, type: "AP", currency: "JPY" });
    expect(result.execution_status).toBe("NEW");
  });
});
