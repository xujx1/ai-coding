package com.ecommerce.inventory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class JdbcBusinessRepository implements BusinessRepository {
    private final String url;
    private final String user;
    private final String password;

    public JdbcBusinessRepository() {
        this(
                System.getenv().getOrDefault("DB_URL", "jdbc:mysql://localhost:3306/ecom_inventory_stocks?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"),
                System.getenv().getOrDefault("DB_USER", "root"),
                System.getenv().getOrDefault("DB_PASSWORD", "")
        );
    }

    public JdbcBusinessRepository(String url, String user, String password) {
        this.url = url;
        this.user = user;
        this.password = password;
    }

    @Override
    public void initialize() {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS inventory_stocks (
                      id VARCHAR(64) PRIMARY KEY,
                      sku_id VARCHAR(255) NOT NULL,
                      warehouse_id VARCHAR(255) NOT NULL,
                      quantity INT NOT NULL,
                      available_quantity INT NOT NULL,
                      status VARCHAR(32) NOT NULL,
                      payload_json JSON NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                    """);
            statement.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS inventory_campaign_protections (
                      id VARCHAR(128) PRIMARY KEY,
                      campaign_id VARCHAR(64) NOT NULL,
                      sku_id VARCHAR(255) NOT NULL,
                      protected_quantity INT NOT NULL,
                      status VARCHAR(32) NOT NULL,
                      payload_json JSON NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                      UNIQUE KEY uk_campaign_sku (campaign_id, sku_id)
                    )
                    """);
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to initialize MySQL table inventory_stocks", error);
        }
    }

    @Override
    public BusinessRecord save(BusinessRecord record) {
        String sql = "INSERT INTO inventory_stocks (id, sku_id, warehouse_id, quantity, available_quantity, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) "
                + "ON DUPLICATE KEY UPDATE sku_id=VALUES(sku_id), warehouse_id=VALUES(warehouse_id), quantity=VALUES(quantity), available_quantity=VALUES(available_quantity), status=VALUES(status), payload_json=VALUES(payload_json)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            statement.setString(index++, record.id());
            statement.setString(index++, String.valueOf(record.attributes().get("skuId")));
            statement.setString(index++, String.valueOf(record.attributes().get("warehouseId")));
            statement.setInt(index++, ((Number) record.attributes().get("quantity")).intValue());
            statement.setInt(index++, ((Number) record.attributes().get("availableQuantity")).intValue());
            statement.setString(index++, record.status());
            statement.setString(index, JsonSupport.toJson(record.attributes()));
            statement.executeUpdate();
            return record;
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to save stock " + record.id(), error);
        }
    }

    @Override
    public Optional<BusinessRecord> findById(String id) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM inventory_stocks WHERE id=?")) {
            statement.setString(1, id);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readRecord(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query stock " + id, error);
        }
    }

    @Override
    public List<BusinessRecord> list() {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM inventory_stocks ORDER BY updated_at DESC LIMIT 100")) {
            try (ResultSet rs = statement.executeQuery()) {
                List<BusinessRecord> records = new ArrayList<>();
                while (rs.next()) records.add(readRecord(rs));
                return records;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to list stock", error);
        }
    }

    @Override
    public Optional<BusinessRecord> findBySkuId(String skuId) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM inventory_stocks WHERE sku_id=? ORDER BY updated_at DESC LIMIT 1")) {
            statement.setString(1, skuId);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readRecord(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query stock by sku " + skuId, error);
        }
    }

    @Override
    public BusinessRecord saveCampaignProtection(BusinessRecord record) {
        String sql = "INSERT INTO inventory_campaign_protections (id, campaign_id, sku_id, protected_quantity, status, payload_json) VALUES (?, ?, ?, ?, ?, ?) "
                + "ON DUPLICATE KEY UPDATE protected_quantity=VALUES(protected_quantity), status=VALUES(status), payload_json=VALUES(payload_json)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            statement.setString(index++, record.id());
            statement.setString(index++, String.valueOf(record.attributes().get("campaignId")));
            statement.setString(index++, String.valueOf(record.attributes().get("skuId")));
            statement.setInt(index++, ((Number) record.attributes().get("protectedStock")).intValue());
            statement.setString(index++, record.status());
            statement.setString(index, JsonSupport.toJson(record.attributes()));
            statement.executeUpdate();
            return record;
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to save campaign protection " + record.id(), error);
        }
    }

    @Override
    public Optional<BusinessRecord> findCampaignProtection(String campaignId, String skuId) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM inventory_campaign_protections WHERE campaign_id=? AND sku_id=?")) {
            statement.setString(1, campaignId);
            statement.setString(2, skuId);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readProtection(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query campaign protection " + campaignId + ":" + skuId, error);
        }
    }

    @Override
    public List<BusinessRecord> listCampaignProtectionsBySkuId(String skuId) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM inventory_campaign_protections WHERE sku_id=?")) {
            statement.setString(1, skuId);
            try (ResultSet rs = statement.executeQuery()) {
                List<BusinessRecord> records = new ArrayList<>();
                while (rs.next()) records.add(readProtection(rs));
                return records;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to list campaign protections for sku " + skuId, error);
        }
    }

    private BusinessRecord readRecord(ResultSet rs) throws SQLException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("stockId", rs.getString("id"));
        attributes.put("skuId", rs.getString("sku_id"));
        attributes.put("warehouseId", rs.getString("warehouse_id"));
        attributes.put("quantity", rs.getInt("quantity"));
        attributes.put("availableQuantity", rs.getInt("available_quantity"));
        return new BusinessRecord(rs.getString("id"), rs.getString("status"), attributes);
    }

    private BusinessRecord readProtection(ResultSet rs) throws SQLException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("campaignId", rs.getString("campaign_id"));
        attributes.put("skuId", rs.getString("sku_id"));
        attributes.put("protectedStock", rs.getInt("protected_quantity"));
        return new BusinessRecord(rs.getString("id"), rs.getString("status"), attributes);
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }
}
