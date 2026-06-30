-- UMP Marketing Platform v1 - Sprint 1+ Database Schema
-- H2 MySQL-compatible mode; same DDL works on MySQL 8.

-- ============================================================
-- B-END MANAGEMENT TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS t_activity (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    activity_id VARCHAR(32) NOT NULL,
    tenant_id VARCHAR(32) NOT NULL,
    activity_name VARCHAR(128) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32) NOT NULL,
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    status VARCHAR(32) NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    scope_type VARCHAR(16) NOT NULL DEFAULT 'ALL',
    scope_refs VARCHAR(2048),
    is_purchase_limited TINYINT DEFAULT 0,
    purchase_limit_per_user INT DEFAULT 0,
    approval_status VARCHAR(32) DEFAULT 'NONE',
    approver_id VARCHAR(32),
    approval_time BIGINT,
    online_time BIGINT,
    reject_reason VARCHAR(512),
    force_offline_reason VARCHAR(512),
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    region_code VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_activity_id ON t_activity(activity_id, region_code);
CREATE INDEX IF NOT EXISTS idx_act_region_status ON t_activity(region_code, status);

CREATE TABLE IF NOT EXISTS t_activity_tool (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tool_id VARCHAR(32) NOT NULL,
    tenant_id VARCHAR(32) NOT NULL,
    tool_name VARCHAR(128) NOT NULL,
    tool_type VARCHAR(32) NOT NULL,
    tool_description VARCHAR(512),
    exclusion_rules VARCHAR(2048) DEFAULT '{}',
    priority INT DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    region_code VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tool_id ON t_activity_tool(tool_id, region_code);

CREATE TABLE IF NOT EXISTS t_activity_scope (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    product_id VARCHAR(32),
    sku_id VARCHAR(32),
    scope_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    region_code VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_scope_key ON t_activity_scope(scope_key, region_code);
CREATE INDEX IF NOT EXISTS idx_scope_act ON t_activity_scope(activity_id, region_code);

CREATE TABLE IF NOT EXISTS t_coupon_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_id VARCHAR(32) NOT NULL,
    template_name VARCHAR(128) NOT NULL,
    coupon_type VARCHAR(32) NOT NULL,
    face_value DECIMAL(18,2) NOT NULL,
    min_amount DECIMAL(18,2) DEFAULT 0,
    total_count INT NOT NULL,
    remain_count INT NOT NULL,
    per_user_limit INT DEFAULT 1,
    valid_start_time BIGINT NOT NULL,
    valid_end_time BIGINT NOT NULL,
    activity_id VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    region_code VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_template_id ON t_coupon_template(template_id, region_code);

CREATE TABLE IF NOT EXISTS t_coupon_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(32) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_name VARCHAR(128),
    total_count INT NOT NULL,
    issued_count INT DEFAULT 0,
    received_count INT DEFAULT 0,
    used_count INT DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    region_code VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_batch_id ON t_coupon_batch(batch_id, region_code);

CREATE TABLE IF NOT EXISTS t_region_cell (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    region_code VARCHAR(32) NOT NULL,
    region_name VARCHAR(128),
    db_shard_key VARCHAR(64),
    redis_namespace VARCHAR(64),
    kafka_topic_prefix VARCHAR(64),
    currency VARCHAR(8) DEFAULT 'CNY',
    language VARCHAR(8) DEFAULT 'zh-CN',
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    is_deleted TINYINT DEFAULT 0,
    version INT DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(64) NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_region_code ON t_region_cell(region_code);

CREATE TABLE IF NOT EXISTS t_sync_event_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    aggregate_type VARCHAR(32) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    payload LONGTEXT,
    consumer_group VARCHAR(64) NOT NULL,
    consume_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    error_message VARCHAR(1024),
    retry_count INT DEFAULT 0,
    next_retry_at BIGINT,
    occurred_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_syncevent_id ON t_sync_event_log(event_id);

CREATE TABLE IF NOT EXISTS t_operation_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    request_id VARCHAR(64),
    operator VARCHAR(64),
    operation_type VARCHAR(64) NOT NULL,
    aggregate_type VARCHAR(32) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    region_code VARCHAR(32),
    before_snapshot LONGTEXT,
    after_snapshot LONGTEXT,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_agg ON t_operation_audit_log(aggregate_id, region_code);

CREATE TABLE IF NOT EXISTS t_idempotency_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_json LONGTEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT NOT NULL,
    expired_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_idem_key ON t_idempotency_record(idempotency_key, region_code);

CREATE TABLE IF NOT EXISTS t_dlq_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    consumer_group VARCHAR(64) NOT NULL,
    payload LONGTEXT,
    error_message VARCHAR(1024),
    retry_count INT DEFAULT 0,
    next_retry_at BIGINT,
    status VARCHAR(16) NOT NULL DEFAULT 'RETRYABLE',
    region_code VARCHAR(32),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dlq_event ON t_dlq_message(event_id);
CREATE INDEX IF NOT EXISTS idx_dlq_retry ON t_dlq_message(status, next_retry_at, retry_count);

CREATE TABLE IF NOT EXISTS t_scope_act_00 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa00_scope ON t_scope_act_00(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa00_act ON t_scope_act_00(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_01 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa01_scope ON t_scope_act_01(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa01_act ON t_scope_act_01(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_02 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa02_scope ON t_scope_act_02(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa02_act ON t_scope_act_02(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_03 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa03_scope ON t_scope_act_03(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa03_act ON t_scope_act_03(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_04 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa04_scope ON t_scope_act_04(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa04_act ON t_scope_act_04(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_05 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa05_scope ON t_scope_act_05(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa05_act ON t_scope_act_05(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_06 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa06_scope ON t_scope_act_06(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa06_act ON t_scope_act_06(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_07 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa07_scope ON t_scope_act_07(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa07_act ON t_scope_act_07(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_08 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa08_scope ON t_scope_act_08(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa08_act ON t_scope_act_08(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_09 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa09_scope ON t_scope_act_09(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa09_act ON t_scope_act_09(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_10 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa10_scope ON t_scope_act_10(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa10_act ON t_scope_act_10(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_11 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa11_scope ON t_scope_act_11(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa11_act ON t_scope_act_11(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_12 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa12_scope ON t_scope_act_12(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa12_act ON t_scope_act_12(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_13 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa13_scope ON t_scope_act_13(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa13_act ON t_scope_act_13(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_14 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa14_scope ON t_scope_act_14(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa14_act ON t_scope_act_14(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_scope_act_15 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    tool_id VARCHAR(32) NOT NULL,
    tool_type VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
    threshold_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    discount_rate DECIMAL(5,2),
    max_discount DECIMAL(18,2),
    coupon_template_id VARCHAR(32),
    region_code VARCHAR(32) NOT NULL,
    version BIGINT DEFAULT 0,
    event_id VARCHAR(64),
    created_at BIGINT,
    updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sa15_scope ON t_scope_act_15(scope_key, region_code, status);
CREATE INDEX IF NOT EXISTS idx_sa15_act ON t_scope_act_15(activity_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_00 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci00_id ON t_coupon_inst_00(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci00_user ON t_coupon_inst_00(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci00_tpluser ON t_coupon_inst_00(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_01 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci01_id ON t_coupon_inst_01(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci01_user ON t_coupon_inst_01(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci01_tpluser ON t_coupon_inst_01(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_02 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci02_id ON t_coupon_inst_02(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci02_user ON t_coupon_inst_02(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci02_tpluser ON t_coupon_inst_02(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_03 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci03_id ON t_coupon_inst_03(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci03_user ON t_coupon_inst_03(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci03_tpluser ON t_coupon_inst_03(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_04 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci04_id ON t_coupon_inst_04(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci04_user ON t_coupon_inst_04(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci04_tpluser ON t_coupon_inst_04(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_05 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci05_id ON t_coupon_inst_05(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci05_user ON t_coupon_inst_05(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci05_tpluser ON t_coupon_inst_05(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_06 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci06_id ON t_coupon_inst_06(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci06_user ON t_coupon_inst_06(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci06_tpluser ON t_coupon_inst_06(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_07 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci07_id ON t_coupon_inst_07(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci07_user ON t_coupon_inst_07(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci07_tpluser ON t_coupon_inst_07(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_08 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci08_id ON t_coupon_inst_08(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci08_user ON t_coupon_inst_08(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci08_tpluser ON t_coupon_inst_08(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_09 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci09_id ON t_coupon_inst_09(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci09_user ON t_coupon_inst_09(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci09_tpluser ON t_coupon_inst_09(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_10 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci10_id ON t_coupon_inst_10(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci10_user ON t_coupon_inst_10(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci10_tpluser ON t_coupon_inst_10(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_11 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci11_id ON t_coupon_inst_11(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci11_user ON t_coupon_inst_11(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci11_tpluser ON t_coupon_inst_11(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_12 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci12_id ON t_coupon_inst_12(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci12_user ON t_coupon_inst_12(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci12_tpluser ON t_coupon_inst_12(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_13 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci13_id ON t_coupon_inst_13(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci13_user ON t_coupon_inst_13(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci13_tpluser ON t_coupon_inst_13(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_14 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci14_id ON t_coupon_inst_14(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci14_user ON t_coupon_inst_14(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci14_tpluser ON t_coupon_inst_14(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_15 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci15_id ON t_coupon_inst_15(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci15_user ON t_coupon_inst_15(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci15_tpluser ON t_coupon_inst_15(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_16 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci16_id ON t_coupon_inst_16(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci16_user ON t_coupon_inst_16(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci16_tpluser ON t_coupon_inst_16(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_17 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci17_id ON t_coupon_inst_17(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci17_user ON t_coupon_inst_17(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci17_tpluser ON t_coupon_inst_17(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_18 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci18_id ON t_coupon_inst_18(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci18_user ON t_coupon_inst_18(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci18_tpluser ON t_coupon_inst_18(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_19 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci19_id ON t_coupon_inst_19(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci19_user ON t_coupon_inst_19(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci19_tpluser ON t_coupon_inst_19(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_20 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci20_id ON t_coupon_inst_20(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci20_user ON t_coupon_inst_20(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci20_tpluser ON t_coupon_inst_20(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_21 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci21_id ON t_coupon_inst_21(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci21_user ON t_coupon_inst_21(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci21_tpluser ON t_coupon_inst_21(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_22 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci22_id ON t_coupon_inst_22(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci22_user ON t_coupon_inst_22(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci22_tpluser ON t_coupon_inst_22(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_23 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci23_id ON t_coupon_inst_23(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci23_user ON t_coupon_inst_23(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci23_tpluser ON t_coupon_inst_23(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_24 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci24_id ON t_coupon_inst_24(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci24_user ON t_coupon_inst_24(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci24_tpluser ON t_coupon_inst_24(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_25 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci25_id ON t_coupon_inst_25(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci25_user ON t_coupon_inst_25(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci25_tpluser ON t_coupon_inst_25(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_26 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci26_id ON t_coupon_inst_26(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci26_user ON t_coupon_inst_26(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci26_tpluser ON t_coupon_inst_26(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_27 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci27_id ON t_coupon_inst_27(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci27_user ON t_coupon_inst_27(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci27_tpluser ON t_coupon_inst_27(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_28 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci28_id ON t_coupon_inst_28(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci28_user ON t_coupon_inst_28(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci28_tpluser ON t_coupon_inst_28(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_29 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci29_id ON t_coupon_inst_29(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci29_user ON t_coupon_inst_29(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci29_tpluser ON t_coupon_inst_29(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_30 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci30_id ON t_coupon_inst_30(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci30_user ON t_coupon_inst_30(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci30_tpluser ON t_coupon_inst_30(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_31 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci31_id ON t_coupon_inst_31(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci31_user ON t_coupon_inst_31(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci31_tpluser ON t_coupon_inst_31(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_32 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci32_id ON t_coupon_inst_32(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci32_user ON t_coupon_inst_32(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci32_tpluser ON t_coupon_inst_32(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_33 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci33_id ON t_coupon_inst_33(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci33_user ON t_coupon_inst_33(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci33_tpluser ON t_coupon_inst_33(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_34 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci34_id ON t_coupon_inst_34(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci34_user ON t_coupon_inst_34(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci34_tpluser ON t_coupon_inst_34(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_35 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci35_id ON t_coupon_inst_35(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci35_user ON t_coupon_inst_35(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci35_tpluser ON t_coupon_inst_35(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_36 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci36_id ON t_coupon_inst_36(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci36_user ON t_coupon_inst_36(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci36_tpluser ON t_coupon_inst_36(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_37 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci37_id ON t_coupon_inst_37(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci37_user ON t_coupon_inst_37(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci37_tpluser ON t_coupon_inst_37(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_38 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci38_id ON t_coupon_inst_38(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci38_user ON t_coupon_inst_38(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci38_tpluser ON t_coupon_inst_38(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_39 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci39_id ON t_coupon_inst_39(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci39_user ON t_coupon_inst_39(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci39_tpluser ON t_coupon_inst_39(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_40 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci40_id ON t_coupon_inst_40(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci40_user ON t_coupon_inst_40(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci40_tpluser ON t_coupon_inst_40(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_41 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci41_id ON t_coupon_inst_41(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci41_user ON t_coupon_inst_41(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci41_tpluser ON t_coupon_inst_41(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_42 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci42_id ON t_coupon_inst_42(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci42_user ON t_coupon_inst_42(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci42_tpluser ON t_coupon_inst_42(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_43 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci43_id ON t_coupon_inst_43(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci43_user ON t_coupon_inst_43(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci43_tpluser ON t_coupon_inst_43(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_44 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci44_id ON t_coupon_inst_44(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci44_user ON t_coupon_inst_44(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci44_tpluser ON t_coupon_inst_44(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_45 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci45_id ON t_coupon_inst_45(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci45_user ON t_coupon_inst_45(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci45_tpluser ON t_coupon_inst_45(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_46 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci46_id ON t_coupon_inst_46(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci46_user ON t_coupon_inst_46(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci46_tpluser ON t_coupon_inst_46(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_47 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci47_id ON t_coupon_inst_47(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci47_user ON t_coupon_inst_47(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci47_tpluser ON t_coupon_inst_47(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_48 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci48_id ON t_coupon_inst_48(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci48_user ON t_coupon_inst_48(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci48_tpluser ON t_coupon_inst_48(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_49 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci49_id ON t_coupon_inst_49(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci49_user ON t_coupon_inst_49(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci49_tpluser ON t_coupon_inst_49(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_50 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci50_id ON t_coupon_inst_50(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci50_user ON t_coupon_inst_50(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci50_tpluser ON t_coupon_inst_50(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_51 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci51_id ON t_coupon_inst_51(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci51_user ON t_coupon_inst_51(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci51_tpluser ON t_coupon_inst_51(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_52 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci52_id ON t_coupon_inst_52(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci52_user ON t_coupon_inst_52(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci52_tpluser ON t_coupon_inst_52(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_53 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci53_id ON t_coupon_inst_53(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci53_user ON t_coupon_inst_53(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci53_tpluser ON t_coupon_inst_53(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_54 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci54_id ON t_coupon_inst_54(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci54_user ON t_coupon_inst_54(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci54_tpluser ON t_coupon_inst_54(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_55 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci55_id ON t_coupon_inst_55(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci55_user ON t_coupon_inst_55(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci55_tpluser ON t_coupon_inst_55(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_56 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci56_id ON t_coupon_inst_56(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci56_user ON t_coupon_inst_56(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci56_tpluser ON t_coupon_inst_56(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_57 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci57_id ON t_coupon_inst_57(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci57_user ON t_coupon_inst_57(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci57_tpluser ON t_coupon_inst_57(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_58 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci58_id ON t_coupon_inst_58(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci58_user ON t_coupon_inst_58(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci58_tpluser ON t_coupon_inst_58(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_59 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci59_id ON t_coupon_inst_59(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci59_user ON t_coupon_inst_59(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci59_tpluser ON t_coupon_inst_59(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_60 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci60_id ON t_coupon_inst_60(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci60_user ON t_coupon_inst_60(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci60_tpluser ON t_coupon_inst_60(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_61 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci61_id ON t_coupon_inst_61(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci61_user ON t_coupon_inst_61(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci61_tpluser ON t_coupon_inst_61(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_62 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci62_id ON t_coupon_inst_62(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci62_user ON t_coupon_inst_62(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci62_tpluser ON t_coupon_inst_62(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_coupon_inst_63 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    coupon_inst_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(32) NOT NULL,
    batch_id VARCHAR(32),
    user_id VARCHAR(64) NOT NULL,
    coupon_type VARCHAR(32),
    status VARCHAR(16) NOT NULL,
    face_value DECIMAL(18,2),
    threshold_amount DECIMAL(18,2),
    order_id VARCHAR(64),
    activity_id VARCHAR(32),
    valid_start_time BIGINT,
    valid_end_time BIGINT,
    issued_at BIGINT,
    received_at BIGINT,
    used_at BIGINT,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci63_id ON t_coupon_inst_63(coupon_inst_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ci63_user ON t_coupon_inst_63(user_id, region_code, status);
CREATE INDEX IF NOT EXISTS idx_ci63_tpluser ON t_coupon_inst_63(template_id, user_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_00 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo00_uk ON t_order_occur_00(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo00_order ON t_order_occur_00(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_01 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo01_uk ON t_order_occur_01(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo01_order ON t_order_occur_01(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_02 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo02_uk ON t_order_occur_02(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo02_order ON t_order_occur_02(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_03 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo03_uk ON t_order_occur_03(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo03_order ON t_order_occur_03(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_04 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo04_uk ON t_order_occur_04(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo04_order ON t_order_occur_04(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_05 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo05_uk ON t_order_occur_05(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo05_order ON t_order_occur_05(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_06 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo06_uk ON t_order_occur_06(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo06_order ON t_order_occur_06(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_07 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo07_uk ON t_order_occur_07(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo07_order ON t_order_occur_07(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_08 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo08_uk ON t_order_occur_08(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo08_order ON t_order_occur_08(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_09 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo09_uk ON t_order_occur_09(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo09_order ON t_order_occur_09(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_10 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo10_uk ON t_order_occur_10(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo10_order ON t_order_occur_10(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_11 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo11_uk ON t_order_occur_11(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo11_order ON t_order_occur_11(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_12 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo12_uk ON t_order_occur_12(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo12_order ON t_order_occur_12(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_13 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo13_uk ON t_order_occur_13(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo13_order ON t_order_occur_13(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_14 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo14_uk ON t_order_occur_14(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo14_order ON t_order_occur_14(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_15 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo15_uk ON t_order_occur_15(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo15_order ON t_order_occur_15(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_16 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo16_uk ON t_order_occur_16(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo16_order ON t_order_occur_16(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_17 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo17_uk ON t_order_occur_17(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo17_order ON t_order_occur_17(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_18 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo18_uk ON t_order_occur_18(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo18_order ON t_order_occur_18(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_19 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo19_uk ON t_order_occur_19(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo19_order ON t_order_occur_19(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_20 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo20_uk ON t_order_occur_20(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo20_order ON t_order_occur_20(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_21 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo21_uk ON t_order_occur_21(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo21_order ON t_order_occur_21(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_22 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo22_uk ON t_order_occur_22(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo22_order ON t_order_occur_22(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_23 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo23_uk ON t_order_occur_23(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo23_order ON t_order_occur_23(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_24 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo24_uk ON t_order_occur_24(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo24_order ON t_order_occur_24(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_25 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo25_uk ON t_order_occur_25(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo25_order ON t_order_occur_25(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_26 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo26_uk ON t_order_occur_26(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo26_order ON t_order_occur_26(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_27 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo27_uk ON t_order_occur_27(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo27_order ON t_order_occur_27(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_28 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo28_uk ON t_order_occur_28(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo28_order ON t_order_occur_28(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_29 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo29_uk ON t_order_occur_29(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo29_order ON t_order_occur_29(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_30 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo30_uk ON t_order_occur_30(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo30_order ON t_order_occur_30(order_id, region_code);
CREATE TABLE IF NOT EXISTS t_order_occur_31 (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    activity_id VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    quantity INT DEFAULT 1,
    region_code VARCHAR(32) NOT NULL,
    version INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    released_at BIGINT,
    confirmed_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oo31_uk ON t_order_occur_31(region_code, order_id, user_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_oo31_order ON t_order_occur_31(order_id, region_code);
