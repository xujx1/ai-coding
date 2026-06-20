package com.ump.marketing.infrastructure.messaging;

/**
 * Canal binlog listener interface - abstracts DB binlog subscription.
 */
public interface CanalBinlogListener {
    /**
     * Called when a B-end table row changes.
     * @param tableName the table that changed
     * @param eventType INSERT/UPDATE/DELETE
     * @param payload JSON row data
     */
    void onBinlogEvent(String tableName, String eventType, String payload);
}
