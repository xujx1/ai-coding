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

function commonRequest(prefix, operator, extra = {}) {
  const reqId = requestId(prefix);
  return {
    ...commonDefaults,
    requestId: reqId,
    operator,
    idempotencyKey: `marketing-admin:${prefix}:${reqId}`,
    timestampMs: Date.now(),
    ...extra
  };
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

function ResultPanel({ result, onClear }) {
  return h(
    Section,
    {
      id: "response",
      title: "接口结果",
      actions: h("button", { type: "button", className: "secondary", onClick: onClear }, "清空")
    },
    h("pre", null, JSON.stringify(result, null, 2))
  );
}

function App() {
  const [operator, setOperator] = useState("admin");
  const [regionCode, setRegionCode] = useState(commonDefaults.regionCode);
  const [activity, setActivity] = useState(() => withDefaultTimes(initialActivity));
  const [product, setProduct] = useState(initialProduct);
  const [ops, setOps] = useState(initialOps);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [result, setResult] = useState({});
  const [pendingAction, setPendingAction] = useState("");

  const navItems = useMemo(
    () => [
      ["activity", "活动设置"],
      ["rules", "优惠规则"],
      ["scope", "范围设置"],
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
    return commonRequest(prefix, operator, { regionCode, ...extra });
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
        h("div", null, h("h1", null, "活动设置"), h("p", null, "配置活动、规则、范围与上线流程。")),
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
          )
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
