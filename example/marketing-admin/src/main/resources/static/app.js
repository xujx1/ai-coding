const output = document.querySelector("#response-output");
const activityForm = document.querySelector("#activity-form");
const productForm = document.querySelector("#product-form");
const clearButton = document.querySelector("#clear-response");

const commonDefaults = {
  caller: "marketing-admin",
  regionCode: "CN"
};

function requestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toMillis(value) {
  if (!value) {
    return null;
  }
  return new Date(value).getTime();
}

function numberOrNull(value) {
  if (value === "" || value == null) {
    return null;
  }
  return Number(value);
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setDefaultTimes() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  activityForm.elements.startTime.value = start.toISOString().slice(0, 16);
  activityForm.elements.endTime.value = end.toISOString().slice(0, 16);
}

function showResult(title, payload) {
  output.textContent = JSON.stringify({ title, ...payload }, null, 2);
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

async function submitWithState(form, action) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    showResult("请求失败", { error: error.message });
  } finally {
    button.disabled = false;
  }
}

activityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitWithState(activityForm, async () => {
    const data = formData(activityForm);
    const reqId = requestId("req-activity");
    const body = {
      ...commonDefaults,
      requestId: reqId,
      idempotencyKey: `marketing-admin:create-activity:${reqId}`,
      operator: data.operator,
      activityName: data.activityName,
      tenantId: data.tenantId,
      toolId: data.toolId,
      toolType: data.toolType,
      thresholdAmount: numberOrNull(data.thresholdAmount),
      discountAmount: numberOrNull(data.discountAmount),
      startTime: toMillis(data.startTime),
      endTime: toMillis(data.endTime),
      scopeType: data.scopeType,
      isPurchaseLimited: false,
      purchaseLimitPerUser: 1,
      timestampMs: Date.now()
    };
    const result = await postJson("/api/activity/create", body);
    if (result.data && result.data.data && result.data.data.activityId) {
      productForm.elements.activityId.value = result.data.data.activityId;
    }
    showResult("创建活动", result);
  });
});

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitWithState(productForm, async () => {
    const data = formData(productForm);
    const reqId = requestId("req-product");
    const body = {
      ...commonDefaults,
      requestId: reqId,
      idempotencyKey: `marketing-admin:bind-product:${reqId}`,
      operator: data.operator,
      activityId: data.activityId,
      productId: data.productId,
      skuId: data.skuId,
      scopeType: data.scopeType,
      timestampMs: Date.now()
    };
    const result = await postJson("/api/product/bind", body);
    showResult("创建商品关联", result);
  });
});

clearButton.addEventListener("click", () => {
  output.textContent = "{}";
});

setDefaultTimes();
