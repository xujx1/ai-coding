const { useMemo, useState } = React;
const h = React.createElement;

const commonDefaults = {
  caller: "marketing-admin",
  regionCode: "CN"
};

const toolOptions = [
  { value: "tool-full-reduce", label: "满减工具", type: "FULL_REDUCE" },
  { value: "tool-single-discount", label: "单品折扣", type: "SINGLE_DISCOUNT" },
  { value: "tool-coupon", label: "优惠券工具", type: "COUPON" }
];

const previewScopeOptions = [
  { value: "", label: "全部范围" },
  { value: "ALL", label: "ALL" },
  { value: "CATEGORY", label: "CATEGORY" },
  { value: "SKU_LIST", label: "SKU_LIST" }
];

const initialActivity = {
  activityId: "",
  activityName: "618满100减20",
  tenantId: "tenant-001",
  toolId: "tool-full-reduce",
  toolType: "FULL_REDUCE",
  thresholdAmount: "100",
  discountAmount: "20",
  discountRate: "",
  maxDiscount: "",
  couponTemplateId: "",
  scopeType: "ALL",
  scopeRefs: "",
  isPurchaseLimited: false,
  purchaseLimitPerUser: "1",
  startTime: "",
  endTime: "",
  expectedVersion: ""
};

const initialProduct = {
  activityId: "",
  productId: "prod-001",
  skuId: "sku-001",
  scopeType: "SKU_LIST"
};

const initialOps = {
  activityId: "",
  approverId: "approver-001",
  comment: "活动配置已确认",
  reason: "活动配置不符合上线要求"
};

const initialPreview = {
  productId: "prod-001",
  skuId: "",
  scopeType: ""
};

function plusDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toLocalInputValue(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function withDefaultTimes(form) {
  const now = new Date();
  return {
    ...form,
    startTime: toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)),
    endTime: toLocalInputValue(plusDays(now, 30))
  };
}

function requestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toMillis(value) {
  return value ? new Date(value).getTime() : null;
}

function numberOrNull(value) {
  if (value === "" || value == null) {
    return null;
  }
  return Number(value);
}

function intOrNull(value) {
  if (value === "" || value == null) {
    return null;
  }
  return Number.parseInt(value, 10);
}

function compactPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

function trimmedText(value) {
  return value == null ? "" : String(value).trim();
}

function optionalText(value) {
  const text = trimmedText(value);
  return text === "" ? undefined : text;
}

function previewModeValue(skuId) {
  return optionalText(skuId) ? "SKU" : "PRODUCT";
}

function previewModeLabel(queryMode, skuId) {
  if (queryMode === "SKU" || (!queryMode && optionalText(skuId))) {
    return "按 SKU 维度预览";
  }
  return "按商品维度预览";
}

function commonRequest(prefix, operator, extra = {}) {
  const reqId = requestId(prefix);
  return {
    ...commonDefaults,
    requestId: reqId,
    operator: trimmedText(operator),
    idempotencyKey: `marketing-admin:${prefix}:${reqId}`,
    timestampMs: Date.now(),
    ...extra
  };
}

function buildPreviewRequestMeta(payload) {
  return {
    ...payload,
    queryMode: previewModeValue(payload && payload.skuId)
  };
}

function previewValidationMessages(requestMeta) {
  const messages = [];
  if (!trimmedText(requestMeta && requestMeta.regionCode)) {
    messages.push("区域不能为空");
  }
  if (!trimmedText(requestMeta && requestMeta.operator)) {
    messages.push("操作人不能为空");
  }
  if (!trimmedText(requestMeta && requestMeta.productId)) {
    messages.push("商品 ID 不能为空");
  }
  return messages;
}

function extractHintTone(hint) {
  const rawTone = String(
    (hint && (hint.level || hint.severity || hint.type || hint.tone || "")) || ""
  ).toLowerCase();
  if (rawTone.indexOf("error") >= 0 || rawTone.indexOf("danger") >= 0) {
    return "danger";
  }
  if (rawTone.indexOf("warn") >= 0 || rawTone.indexOf("degrade") >= 0) {
    return "warning";
  }
  return "info";
}

function resolveHintTitle(hint) {
  return (hint && (hint.title || hint.code || hint.type || hint.level)) || "提示";
}

function resolveHintDetail(hint) {
  return (hint && (hint.detail || hint.message || hint.description || hint.reason || "")) || "";
}

function rpcEnvelope(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("success" in value || "code" in value || "message" in value || "requestId" in value)
  );
}

function responseMetaText(requestIdText, httpStatus) {
  return [requestIdText ? `requestId: ${requestIdText}` : null, httpStatus ? `HTTP ${httpStatus}` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatTimestamp(value) {
  if (value == null || value === "") {
    return "-";
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { raw: text };
  }
  return { httpStatus: response.status, data };
}

function Field({ label, children, className = "" }) {
  return h(
    "label",
    { className: `field ${className}`.trim() },
    h("span", null, label),
    children
  );
}

function TextInput({ value, onChange, ...props }) {
  return h("input", {
    ...props,
    value,
    onChange: (event) => onChange(event.target.value)
  });
}

function SelectInput({ value, onChange, options, ...props }) {
  return h(
    "select",
    {
      ...props,
      value,
      onChange: (event) => onChange(event.target.value)
    },
    options.map((option) => h("option", { key: option.value, value: option.value }, option.label || option.value))
  );
}

function Toggle({ checked, onChange, label }) {
  return h(
    "button",
    {
      type: "button",
      className: checked ? "toggle is-on" : "toggle",
      "aria-pressed": checked,
      onClick: () => onChange(!checked)
    },
    h("span", null),
    label
  );
}

function Section({ id, title, actions, children }) {
  return h(
    "section",
    { id, className: "section" },
    h(
      "div",
      { className: "section-title" },
      h("h2", null, title),
      actions ? h("div", { className: "section-actions" }, actions) : null
    ),
    children
  );
}

function SummaryMetric({ label, value }) {
  return h(
    "div",
    { className: "metric" },
    h("span", null, label),
    h("strong", null, value || "-")
  );
}

function MiniMetric({ label, value }) {
  return h(
    "div",
    { className: "mini-metric" },
    h("span", null, label),
    h("strong", null, value)
  );
}

function ActivitySummary({ item }) {
  const discountText = [
    item.thresholdAmount ? `门槛 ${item.thresholdAmount}` : null,
    item.discountAmount ? `减 ${item.discountAmount}` : null,
    item.discountRate ? `折扣 ${item.discountRate}` : null,
    item.maxDiscount ? `封顶 ${item.maxDiscount}` : null,
    item.couponTemplateId ? `券模板 ${item.couponTemplateId}` : null
  ]
    .filter(Boolean)
    .join(" / ");

  return h(
    "article",
    { className: "activity-card" },
    h(
      "div",
      { className: "activity-card-head" },
      h("strong", null, item.activityName || item.activityId || "未命名活动"),
      h("span", { className: "activity-chip" }, item.status || "UNKNOWN")
    ),
    h(
      "p",
      { className: "activity-meta" },
      [
        item.activityId ? `ID ${item.activityId}` : null,
        item.toolType ? `玩法 ${item.toolType}` : null,
        item.regionCode ? `区域 ${item.regionCode}` : null,
        item.sourceSide ? `来源 ${item.sourceSide}` : null
      ]
        .filter(Boolean)
        .join(" · ")
    ),
    discountText ? h("p", { className: "activity-meta" }, discountText) : null,
    h(
      "p",
      { className: "activity-meta" },
      [
        item.productId ? `商品 ${item.productId}` : null,
        item.skuId ? `SKU ${item.skuId}` : null,
        item.scopeType ? `范围 ${item.scopeType}` : null
      ]
        .filter(Boolean)
        .join(" · ") || "未返回命中条件"
    )
  );
}

function HintList({ hints, emptyText }) {
  if (!hints || !hints.length) {
    return h("p", { className: "empty-copy" }, emptyText || "暂无提示");
  }
  return h(
    "div",
    { className: "hint-list" },
    hints.map((hint, index) =>
      h(
        "article",
        {
          key: `${(hint && (hint.code || hint.title || hint.type)) || "hint"}-${index}`,
          className: `hint-card is-${extractHintTone(hint)}`
        },
        h("strong", null, resolveHintTitle(hint)),
        h("p", null, resolveHintDetail(hint))
      )
    )
  );
}

function PreviewAlert({ tone, title, message, extra }) {
  return h(
    "div",
    { className: `preview-alert is-${tone || "info"}` },
    h("strong", null, title),
    message ? h("p", null, message) : null,
    extra ? h("span", null, extra) : null
  );
}

function DetailChip({ label, value, muted }) {
  return h(
    "div",
    { className: muted ? "detail-chip is-muted" : "detail-chip" },
    h("span", null, label),
    h("strong", null, value || "-")
  );
}

function PreviewRequestCard({ request, querySummary, preview }) {
  const summary = querySummary || {};
  const requestSnapshot = request || {};
  const currentQueryMode = summary.queryMode || requestSnapshot.queryMode || previewModeValue(preview && preview.skuId);
  const scopeType = summary.scopeType || requestSnapshot.scopeType;
  const validationMessages = previewValidationMessages({
    regionCode: summary.regionCode || requestSnapshot.regionCode,
    operator: summary.operator || requestSnapshot.operator,
    productId: summary.productId || requestSnapshot.productId
  });

  return h(
    "div",
    { className: "preview-request-card" },
    h(
      "div",
      { className: "preview-request-head" },
      h("div", null, h("h3", null, "本次预览请求"), h("p", null, "提交字段、请求链路和解析后的查询上下文会在这里回显。")),
      h("span", { className: "preview-badge is-request" }, previewModeLabel(currentQueryMode, summary.skuId || requestSnapshot.skuId))
    ),
    validationMessages.length
      ? h(
          "div",
          { className: "preview-inline-warning" },
          validationMessages.map((message, index) => h("span", { key: `${message}-${index}` }, message))
        )
      : null,
    h(
      "div",
      { className: "detail-grid" },
      h(DetailChip, { label: "区域", value: summary.regionCode || requestSnapshot.regionCode }),
      h(DetailChip, { label: "操作人", value: summary.operator || requestSnapshot.operator }),
      h(DetailChip, { label: "商品 ID", value: summary.productId || requestSnapshot.productId }),
      h(DetailChip, {
        label: "SKU ID",
        value: summary.skuId || requestSnapshot.skuId || "未填写",
        muted: !(summary.skuId || requestSnapshot.skuId)
      }),
      h(DetailChip, {
        label: "范围类型",
        value: scopeType || "全部范围",
        muted: !scopeType
      }),
      h(DetailChip, { label: "queryMode", value: currentQueryMode || previewModeValue(summary.skuId || requestSnapshot.skuId) }),
      h(DetailChip, { label: "requestId", value: summary.requestId || requestSnapshot.requestId }),
      h(DetailChip, { label: "idempotencyKey", value: requestSnapshot.idempotencyKey }),
      h(DetailChip, { label: "caller", value: requestSnapshot.caller || commonDefaults.caller }),
      h(DetailChip, { label: "时间戳", value: formatTimestamp(requestSnapshot.timestampMs) })
    )
  );
}

function PreviewSidePanel({ title, result, fallbackText, queryMode }) {
  const activities = (result && result.activities) || [];
  const effectiveQueryMode = (result && result.queryMode) || queryMode;
  const queryModeText = previewModeLabel(effectiveQueryMode, null);
  const statusLabel =
    result && result.available === false ? "结果暂不可用" : result && result.hit ? "已命中" : "未命中";
  const badgeClass =
    result && result.available === false
      ? "preview-badge is-warning"
      : result && result.hit
      ? "preview-badge is-hit"
      : "preview-badge";

  return h(
    "section",
    { className: "preview-side" },
    h(
      "div",
      { className: "preview-side-head" },
      h("div", null, h("h3", null, title), h("p", null, result && result.summary ? result.summary : fallbackText)),
      h("span", { className: badgeClass }, statusLabel)
    ),
    h("p", { className: "preview-mode" }, queryModeText),
    result && result.reasonCode ? h("p", { className: "preview-reason-code" }, `原因码: ${result.reasonCode}`) : null,
    result && result.reasonMessage ? h("p", { className: "preview-reason" }, result.reasonMessage) : null,
    activities.length
      ? h(
          "div",
          { className: "activity-list" },
          activities.map((item, index) => h(ActivitySummary, { key: `${item.activityId || title}-${index}`, item }))
        )
      : h("div", { className: "preview-empty" }, h("strong", null, "未返回命中活动"), h("p", null, fallbackText)),
    h(HintList, {
      hints: result && result.hints,
      emptyText: "当前侧无额外排查提示"
    })
  );
}

function PreviewPanel({
  previewResult,
  previewRequestMeta,
  pending,
  onSubmit,
  onClear,
  preview,
  updatePreview,
  operator,
  setOperator,
  regionCode,
  setRegionCode
}) {
  const rpc = previewResult && rpcEnvelope(previewResult.data) ? previewResult.data : null;
  const data = rpc && rpc.success !== false ? rpc.data : null;
  const activeRequest =
    (previewResult && previewResult.request) ||
    previewRequestMeta || {
      regionCode: trimmedText(regionCode),
      operator: trimmedText(operator),
      productId: trimmedText(preview.productId),
      skuId: optionalText(preview.skuId),
      scopeType: optionalText(preview.scopeType),
      queryMode: previewModeValue(preview.skuId),
      caller: commonDefaults.caller
    };
  const querySummary = data && data.querySummary;
  const effectiveQueryMode = (querySummary && querySummary.queryMode) || activeRequest.queryMode;
  const hasAttempt = Boolean(previewRequestMeta || previewResult);
  const managementCount = data && data.managementResult && data.managementResult.activities ? data.managementResult.activities.length : 0;
  const runtimeCount = data && data.runtimeResult && data.runtimeResult.activities ? data.runtimeResult.activities.length : 0;
  const diffCount = data && data.diffHints ? data.diffHints.length : 0;
  const requestIdText = (querySummary && querySummary.requestId) || (rpc && rpc.requestId) || activeRequest.requestId;
  const runtimeUnavailable = data && data.runtimeResult && data.runtimeResult.available === false;
  const isRpcError = rpc && rpc.success === false;
  const isNetworkError = previewResult && previewResult.error;
  const isHttpErrorWithoutRpc = Boolean(previewResult && previewResult.httpStatus >= 400 && !rpc && !isNetworkError);
  const httpMeta = responseMetaText(requestIdText, previewResult && previewResult.httpStatus);
  const noRenderableData = hasAttempt && !pending && !data && !isRpcError && !isNetworkError && !isHttpErrorWithoutRpc;

  return h(
    Section,
    {
      id: "preview",
      title: "活动命中预览",
      actions: [
        h(
          "button",
          { key: "preview-submit", type: "button", className: "primary", disabled: pending, onClick: onSubmit },
          pending ? "预览中" : "发起预览"
        ),
        h(
          "button",
          { key: "preview-clear", type: "button", className: "secondary", disabled: !hasAttempt && !pending, onClick: onClear },
          "清空结果"
        )
      ]
    },
    h(
      "div",
      { className: "preview-shell" },
      h(
        "div",
        { className: "preview-form-grid" },
        h(Field, { label: "区域" }, h(TextInput, { value: regionCode, onChange: setRegionCode, placeholder: "例如 CN" })),
        h(Field, { label: "操作人" }, h(TextInput, { value: operator, onChange: setOperator, placeholder: "例如 admin" })),
        h(Field, { label: "商品 ID" }, h(TextInput, { value: preview.productId, onChange: (value) => updatePreview("productId", value), placeholder: "必填" })),
        h(Field, { label: "SKU ID" }, h(TextInput, { value: preview.skuId, onChange: (value) => updatePreview("skuId", value), placeholder: "可选，非空时优先按 SKU" })),
        h(
          Field,
          { label: "活动范围类型" },
          h(SelectInput, {
            value: preview.scopeType,
            onChange: (value) => updatePreview("scopeType", value),
            options: previewScopeOptions
          })
        ),
        h(
          Field,
          { label: "预览说明" },
          h(
            "div",
            { className: "preview-note" },
            preview.skuId
              ? "当前将以 SKU 为主键发起预览，管理配置侧和用户运行侧都会走 SKU 优先逻辑。"
              : "当前未填写 SKU，将按商品维度预览；如存在 SKU 精细配置，请补充 SKU ID。"
          )
        )
      ),
      h(
        "div",
        { className: "preview-context-column" },
        h(PreviewRequestCard, { request: activeRequest, querySummary, preview }),
        h(
          "div",
          { className: "preview-metrics" },
          h(MiniMetric, { label: "管理侧活动数", value: managementCount }),
          h(MiniMetric, { label: "运行侧活动数", value: runtimeCount }),
          h(MiniMetric, { label: "差异提示数", value: diffCount })
        )
      )
    ),
    h(
      "p",
      { className: "section-intro" },
      [
        activeRequest.regionCode ? `区域 ${activeRequest.regionCode}` : "区域待填写",
        activeRequest.productId ? `商品 ${activeRequest.productId}` : "商品待填写",
        activeRequest.skuId ? `SKU ${activeRequest.skuId}` : "当前为商品维度",
        previewModeLabel(effectiveQueryMode, activeRequest.skuId)
      ].join(" · ")
    ),
    pending
      ? h(PreviewAlert, {
          tone: "info",
          title: "正在请求 /api/preview/activity-hit",
          message: "页面会保留最近一次结果，并在响应返回后刷新管理配置侧、用户运行侧和差异提示。",
          extra: requestIdText ? `requestId: ${requestIdText}` : null
        })
      : null,
    isNetworkError
      ? h(PreviewAlert, {
          tone: "danger",
          title: "预览请求失败",
          message: previewResult.error,
          extra: requestIdText ? `requestId: ${requestIdText}` : null
        })
      : null,
    isRpcError
      ? h(PreviewAlert, {
          tone: "danger",
          title: rpc.code || "PREVIEW_FAILED",
          message: rpc.message || "预览接口返回失败，请检查请求字段后重试。",
          extra: requestIdText ? `requestId: ${requestIdText}` : null
        })
      : null,
    runtimeUnavailable
      ? h(PreviewAlert, {
          tone: "warning",
          title: "运行侧结果已降级",
          message: "管理配置侧结果仍可查看；请结合差异提示和运行侧原因继续排查同步、生效或下游可达性问题。"
        })
      : null,
    data
      ? h(
          "div",
          { className: "preview-results-grid" },
          h(PreviewSidePanel, {
            title: "管理配置侧",
            result: data.managementResult,
            queryMode: effectiveQueryMode,
            fallbackText: "请检查活动范围绑定、区域配置和活动状态。"
          }),
          h(PreviewSidePanel, {
            title: "用户运行侧",
            result: data.runtimeResult,
            queryMode: effectiveQueryMode,
            fallbackText: "如无命中，可能尚未上线、生效或同步完成。"
          }),
          h(
            "section",
            { className: "preview-diff" },
            h("h3", null, "差异提示"),
            h(HintList, {
              hints: data.diffHints,
              emptyText: "当前双侧未发现额外差异。"
            })
          )
        )
      : noRenderableData
      ? h(
          "div",
          { className: "preview-empty-state" },
          h("strong", null, "未拿到可展示结果"),
          h("p", null, "接口已返回，但未包含可渲染的预览数据。请结合下方接口结果与 requestId 排查响应结构。")
        )
      : h(
          "div",
          { className: "preview-empty-state" },
          h("strong", null, hasAttempt ? "等待新的预览结果" : "尚未发起预览"),
          h(
            "p",
            null,
            hasAttempt
              ? "当前会话没有可展示的命中结果，可以调整区域、商品或 SKU 后再次发起预览。"
              : "这里会展示管理配置侧、用户运行侧、请求上下文以及双侧差异提示。"
          )
        )
  );
}

function ResultPanel({ result, onClear }) {
  return h(
    Section,
    {
      id: "response",
      title: "接口结果",
      actions: h("button", { type: "button", className: "secondary", onClick: onClear }, "清空")
    },
    Object.keys(result || {}).length
      ? h("pre", null, JSON.stringify(result, null, 2))
      : h(
          "div",
          { className: "preview-empty-state is-compact" },
          h("strong", null, "暂无接口返回"),
          h("p", null, "发起创建、绑定、生命周期或命中预览操作后，这里会保留最近一次响应。")
        )
  );
}

function App() {
  const [operator, setOperator] = useState("admin");
  const [regionCode, setRegionCode] = useState(commonDefaults.regionCode);
  const [activity, setActivity] = useState(() => withDefaultTimes(initialActivity));
  const [product, setProduct] = useState(initialProduct);
  const [ops, setOps] = useState(initialOps);
  const [preview, setPreview] = useState(initialPreview);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [result, setResult] = useState({});
  const [previewResult, setPreviewResult] = useState(null);
  const [previewRequestMeta, setPreviewRequestMeta] = useState(null);
  const [pendingAction, setPendingAction] = useState("");

  const navItems = useMemo(
    () => [
      ["activity", "活动设置"],
      ["rules", "优惠规则"],
      ["scope", "范围设置"],
      ["preview", "命中预览"],
      ["lifecycle", "生命周期"],
      ["response", "接口结果"]
    ],
    []
  );

  function updateActivity(key, value) {
    setActivity((prev) => ({ ...prev, [key]: value }));
  }

  function updateProduct(key, value) {
    setProduct((prev) => ({ ...prev, [key]: value }));
  }

  function updateOps(key, value) {
    setOps((prev) => ({ ...prev, [key]: value }));
  }

  function updatePreview(key, value) {
    setPreview((prev) => ({ ...prev, [key]: value }));
  }

  function syncActivityId(activityId) {
    if (!activityId) {
      return;
    }
    setActivity((prev) => ({ ...prev, activityId }));
    setProduct((prev) => ({ ...prev, activityId }));
    setOps((prev) => ({ ...prev, activityId }));
  }

  function applyActivityResponse(response) {
    const data = response && response.data && response.data.data;
    if (!data || !data.activityId) {
      return;
    }
    setCurrentActivity(data);
    syncActivityId(data.activityId);
    setActivity((prev) => ({
      ...prev,
      activityId: data.activityId || prev.activityId,
      activityName: data.activityName || prev.activityName,
      tenantId: data.tenantId || prev.tenantId,
      toolId: data.toolId || prev.toolId,
      toolType: data.toolType || prev.toolType,
      thresholdAmount: data.thresholdAmount == null ? prev.thresholdAmount : String(data.thresholdAmount),
      discountAmount: data.discountAmount == null ? prev.discountAmount : String(data.discountAmount),
      discountRate: data.discountRate == null ? prev.discountRate : String(data.discountRate),
      maxDiscount: data.maxDiscount == null ? prev.maxDiscount : String(data.maxDiscount),
      couponTemplateId: data.couponTemplateId || prev.couponTemplateId,
      scopeType: data.scopeType || prev.scopeType,
      scopeRefs: data.scopeRefs || prev.scopeRefs,
      isPurchaseLimited: Boolean(data.isPurchaseLimited),
      purchaseLimitPerUser: data.purchaseLimitPerUser == null ? prev.purchaseLimitPerUser : String(data.purchaseLimitPerUser),
      expectedVersion: data.version == null ? "" : String(data.version)
    }));
  }

  async function runAction(actionKey, title, action) {
    setPendingAction(actionKey);
    try {
      const response = await action();
      setResult({ title, ...response });
      applyActivityResponse(response);
    } catch (error) {
      setResult({ title, error: error.message });
    } finally {
      setPendingAction("");
    }
  }

  function base(prefix, extra = {}) {
    return commonRequest(prefix, operator, { regionCode: trimmedText(regionCode), ...extra });
  }

  function buildCreatePayload() {
    return compactPayload(
      base("create-activity", {
        activityName: activity.activityName,
        tenantId: activity.tenantId,
        toolId: activity.toolId,
        toolType: activity.toolType,
        thresholdAmount: numberOrNull(activity.thresholdAmount),
        discountAmount: numberOrNull(activity.discountAmount),
        discountRate: numberOrNull(activity.discountRate),
        maxDiscount: numberOrNull(activity.maxDiscount),
        couponTemplateId: activity.couponTemplateId,
        isPurchaseLimited: activity.isPurchaseLimited,
        purchaseLimitPerUser: intOrNull(activity.purchaseLimitPerUser),
        startTime: toMillis(activity.startTime),
        endTime: toMillis(activity.endTime),
        scopeType: activity.scopeType,
        scopeRefs: activity.scopeRefs
      })
    );
  }

  function buildUpdatePayload() {
    return compactPayload(
      base("update-activity", {
        activityId: activity.activityId,
        activityName: activity.activityName,
        thresholdAmount: numberOrNull(activity.thresholdAmount),
        discountAmount: numberOrNull(activity.discountAmount),
        discountRate: numberOrNull(activity.discountRate),
        maxDiscount: numberOrNull(activity.maxDiscount),
        startTime: toMillis(activity.startTime),
        endTime: toMillis(activity.endTime),
        scopeType: activity.scopeType,
        scopeRefs: activity.scopeRefs,
        expectedVersion: intOrNull(activity.expectedVersion)
      })
    );
  }

  function activityCommand(path, prefix, extra = {}) {
    return postJson(path, compactPayload(base(prefix, extra)));
  }

  function buildPreviewPayload() {
    return compactPayload(
      base("preview-activity-hit", {
        productId: trimmedText(preview.productId),
        skuId: optionalText(preview.skuId),
        scopeType: optionalText(preview.scopeType)
      })
    );
  }

  async function submitPreview() {
    const payload = buildPreviewPayload();
    const requestMeta = buildPreviewRequestMeta(payload);
    const validationMessages = previewValidationMessages(requestMeta);
    setPreviewRequestMeta(requestMeta);
    if (validationMessages.length) {
      const message = validationMessages.join("；");
      const nextResult = {
        title: "活动命中预览",
        request: requestMeta,
        httpStatus: 400,
        data: {
          success: false,
          code: "INVALID_ARGUMENT",
          message,
          requestId: requestMeta.requestId,
          data: null
        }
      };
      setPreviewResult(nextResult);
      setResult(nextResult);
      return;
    }
    setPendingAction("preview");
    try {
      const response = await postJson("/api/preview/activity-hit", payload);
      const nextResult = { title: "活动命中预览", request: requestMeta, ...response };
      setPreviewResult(nextResult);
      setResult(nextResult);
    } catch (error) {
      const nextResult = { title: "活动命中预览", request: requestMeta, error: error.message };
      setPreviewResult(nextResult);
      setResult(nextResult);
    } finally {
      setPendingAction("");
    }
  }

  function clearPreviewResult() {
    setPreviewResult(null);
    setPreviewRequestMeta(null);
  }

  function renderButton(actionKey, label, className, onClick, disabled = false) {
    return h(
      "button",
      {
        key: actionKey,
        type: "button",
        className,
        disabled: disabled || pendingAction === actionKey,
        onClick
      },
      pendingAction === actionKey ? "处理中" : label
    );
  }

  const hasActivityId = Boolean(activity.activityId || ops.activityId);

  return h(
    "div",
    { className: "app-shell" },
    h(
      "aside",
      { className: "sidebar" },
      h(
        "div",
        { className: "brand" },
        h("span", { className: "brand-mark" }, "M"),
        h("div", null, h("strong", null, "营销管理台"), h("span", null, "marketing-admin"))
      ),
      h(
        "nav",
        null,
        navItems.map(([id, label]) => h("a", { key: id, href: `#${id}` }, label))
      )
    ),
    h(
      "main",
      null,
      h(
        "header",
        { className: "topbar" },
        h(
          "div",
          null,
          h("h1", null, "活动配置与命中预览"),
          h("p", null, "在同一页完成活动创建、范围绑定、生命周期流转，以及管理配置侧和用户运行侧的活动命中排查。")
        ),
        h(
          "div",
          { className: "operator-bar" },
          h(TextInput, {
            "aria-label": "操作人",
            value: operator,
            onChange: setOperator,
            placeholder: "操作人"
          }),
          h(TextInput, {
            "aria-label": "区域",
            value: regionCode,
            onChange: setRegionCode,
            placeholder: "区域"
          })
        )
      ),
      h(
        "section",
        { className: "summary" },
        h(SummaryMetric, { label: "活动 ID", value: activity.activityId }),
        h(SummaryMetric, { label: "状态", value: currentActivity && currentActivity.status }),
        h(SummaryMetric, { label: "版本", value: activity.expectedVersion }),
        h(SummaryMetric, { label: "区域", value: regionCode })
      ),
      h(
        "div",
        { className: "workspace" },
        h(
          "div",
          { className: "primary-column" },
          h(
            Section,
            {
              id: "activity",
              title: "活动设置",
              actions: [
                renderButton("create", "创建活动", "primary", () =>
                  runAction("create", "创建活动", () => postJson("/api/activity/create", buildCreatePayload()))
                ),
                renderButton("update", "保存修改", "secondary", () =>
                  runAction("update", "保存修改", () => postJson("/api/activity/update", buildUpdatePayload())),
                  !activity.activityId
                )
              ]
            },
            h(
              "div",
              { className: "form-grid" },
              h(Field, { label: "活动 ID" }, h(TextInput, { value: activity.activityId, onChange: (value) => updateActivity("activityId", value), placeholder: "创建后自动填充" })),
              h(Field, { label: "活动名称" }, h(TextInput, { value: activity.activityName, onChange: (value) => updateActivity("activityName", value), required: true })),
              h(Field, { label: "租户 ID" }, h(TextInput, { value: activity.tenantId, onChange: (value) => updateActivity("tenantId", value), required: true })),
              h(
                Field,
                { label: "工具 ID" },
                h(SelectInput, {
                  value: activity.toolId,
                  onChange: (value) => {
                    const selected = toolOptions.find((item) => item.value === value);
                    setActivity((prev) => ({ ...prev, toolId: value, toolType: selected ? selected.type : prev.toolType }));
                  },
                  options: toolOptions
                })
              ),
              h(
                Field,
                { label: "工具类型" },
                h(SelectInput, {
                  value: activity.toolType,
                  onChange: (value) => updateActivity("toolType", value),
                  options: [
                    { value: "FULL_REDUCE" },
                    { value: "SINGLE_DISCOUNT" },
                    { value: "COUPON" }
                  ]
                })
              ),
              h(Field, { label: "开始时间" }, h(TextInput, { type: "datetime-local", value: activity.startTime, onChange: (value) => updateActivity("startTime", value), required: true })),
              h(Field, { label: "结束时间" }, h(TextInput, { type: "datetime-local", value: activity.endTime, onChange: (value) => updateActivity("endTime", value), required: true })),
              h(Field, { label: "期望版本" }, h(TextInput, { type: "number", min: "0", value: activity.expectedVersion, onChange: (value) => updateActivity("expectedVersion", value), placeholder: "保存时用于乐观锁" }))
            )
          ),
          h(
            Section,
            { id: "rules", title: "优惠规则" },
            h(
              "div",
              { className: "form-grid" },
              h(Field, { label: "门槛金额" }, h(TextInput, { type: "number", min: "0", step: "0.01", value: activity.thresholdAmount, onChange: (value) => updateActivity("thresholdAmount", value) })),
              h(Field, { label: "优惠金额" }, h(TextInput, { type: "number", min: "0", step: "0.01", value: activity.discountAmount, onChange: (value) => updateActivity("discountAmount", value) })),
              h(Field, { label: "折扣率" }, h(TextInput, { type: "number", min: "0", max: "1", step: "0.01", value: activity.discountRate, onChange: (value) => updateActivity("discountRate", value), placeholder: "0.8" })),
              h(Field, { label: "最高优惠" }, h(TextInput, { type: "number", min: "0", step: "0.01", value: activity.maxDiscount, onChange: (value) => updateActivity("maxDiscount", value) })),
              h(Field, { label: "券模板 ID" }, h(TextInput, { value: activity.couponTemplateId, onChange: (value) => updateActivity("couponTemplateId", value), placeholder: "优惠券玩法填写" })),
              h(
                Field,
                { label: "限购" },
                h(
                  "div",
                  { className: "inline-control" },
                  h(Toggle, { checked: activity.isPurchaseLimited, onChange: (value) => updateActivity("isPurchaseLimited", value), label: "每人限购" }),
                  h(TextInput, { type: "number", min: "1", value: activity.purchaseLimitPerUser, onChange: (value) => updateActivity("purchaseLimitPerUser", value), disabled: !activity.isPurchaseLimited })
                )
              )
            )
          ),
          h(
            Section,
            {
              id: "scope",
              title: "范围设置",
              actions: renderButton(
                "bind",
                "绑定商品",
                "secondary",
                () =>
                  runAction("bind", "绑定商品", () =>
                    postJson(
                      "/api/product/bind",
                      compactPayload(
                        base("bind-product", {
                          activityId: product.activityId || activity.activityId,
                          productId: product.productId,
                          skuId: product.skuId,
                          scopeType: product.scopeType
                        })
                      )
                    )
                  ),
                !(product.activityId || activity.activityId)
              )
            },
            h(
              "div",
              { className: "form-grid" },
              h(
                Field,
                { label: "活动范围" },
                h(SelectInput, {
                  value: activity.scopeType,
                  onChange: (value) => updateActivity("scopeType", value),
                  options: [
                    { value: "ALL" },
                    { value: "CATEGORY" },
                    { value: "SKU_LIST" }
                  ]
                })
              ),
              h(Field, { label: "范围引用" }, h(TextInput, { value: activity.scopeRefs, onChange: (value) => updateActivity("scopeRefs", value), placeholder: "category-001 或 sku-001,sku-002" })),
              h(Field, { label: "绑定活动 ID" }, h(TextInput, { value: product.activityId, onChange: (value) => updateProduct("activityId", value), placeholder: "默认使用当前活动" })),
              h(Field, { label: "商品 ID" }, h(TextInput, { value: product.productId, onChange: (value) => updateProduct("productId", value) })),
              h(Field, { label: "SKU ID" }, h(TextInput, { value: product.skuId, onChange: (value) => updateProduct("skuId", value) })),
              h(
                Field,
                { label: "绑定范围类型" },
                h(SelectInput, {
                  value: product.scopeType,
                  onChange: (value) => updateProduct("scopeType", value),
                  options: [
                    { value: "SKU_LIST" },
                    { value: "CATEGORY" },
                    { value: "ALL" }
                  ]
                })
              )
            )
          ),
          h(PreviewPanel, {
            previewResult,
            previewRequestMeta,
            pending: pendingAction === "preview",
            onSubmit: submitPreview,
            onClear: clearPreviewResult,
            preview,
            updatePreview,
            operator,
            setOperator,
            regionCode,
            setRegionCode
          })
        ),
        h(
          "div",
          { className: "side-column" },
          h(
            Section,
            { id: "lifecycle", title: "生命周期" },
            h(
              "div",
              { className: "stack" },
              h(Field, { label: "操作活动 ID" }, h(TextInput, { value: ops.activityId, onChange: (value) => updateOps("activityId", value), placeholder: "默认使用当前活动" })),
              h(Field, { label: "审批人" }, h(TextInput, { value: ops.approverId, onChange: (value) => updateOps("approverId", value) })),
              h(Field, { label: "审批备注" }, h("textarea", { value: ops.comment, onChange: (event) => updateOps("comment", event.target.value), rows: 3 })),
              h(Field, { label: "驳回/下线原因" }, h("textarea", { value: ops.reason, onChange: (event) => updateOps("reason", event.target.value), rows: 3 })),
              h(
                "div",
                { className: "action-grid" },
                renderButton("submit", "提交审批", "secondary", () =>
                  runAction("submit", "提交审批", () =>
                    activityCommand("/api/activity/submitApproval", "submit-approval", {
                      activityId: ops.activityId || activity.activityId,
                      comment: ops.comment
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("approve", "审批通过", "secondary", () =>
                  runAction("approve", "审批通过", () =>
                    activityCommand("/api/activity/approve", "approve-activity", {
                      activityId: ops.activityId || activity.activityId,
                      approverId: ops.approverId,
                      comment: ops.comment
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("reject", "审批驳回", "secondary", () =>
                  runAction("reject", "审批驳回", () =>
                    activityCommand("/api/activity/reject", "reject-activity", {
                      activityId: ops.activityId || activity.activityId,
                      approverId: ops.approverId,
                      reason: ops.reason
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("online", "上线", "primary", () =>
                  runAction("online", "上线", () =>
                    activityCommand("/api/activity/online", "online-activity", {
                      activityId: ops.activityId || activity.activityId
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("pause", "暂停/恢复", "secondary", () =>
                  runAction("pause", "暂停/恢复", () =>
                    activityCommand("/api/activity/pause", "pause-activity", {
                      activityId: ops.activityId || activity.activityId
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("force-offline", "强制下线", "danger", () =>
                  runAction("force-offline", "强制下线", () =>
                    activityCommand("/api/activity/forceOffline", "force-offline", {
                      activityId: ops.activityId || activity.activityId,
                      reason: ops.reason
                    })
                  ),
                  !hasActivityId
                ),
                renderButton("delete", "删除活动", "danger ghost", () =>
                  runAction("delete", "删除活动", () =>
                    activityCommand("/api/activity/delete", "delete-activity", {
                      activityId: ops.activityId || activity.activityId
                    })
                  ),
                  !hasActivityId
                )
              )
            )
          ),
          h(ResultPanel, { result, onClear: () => setResult({}) })
        )
      )
    )
  );
}

const root = ReactDOM.createRoot(document.querySelector("#root"));
root.render(h(App));
