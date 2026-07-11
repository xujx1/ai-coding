package com.ecommerce.product;

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
                System.getenv().getOrDefault("DB_URL", "jdbc:mysql://localhost:3306/ecom_product_skus?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"),
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
                    CREATE TABLE IF NOT EXISTS product_skus (
                      id VARCHAR(64) PRIMARY KEY,
                      spu_id VARCHAR(255) NOT NULL,
                      title VARCHAR(255) NOT NULL,
                      category_id VARCHAR(255) NOT NULL,
                      brand_id VARCHAR(255) NOT NULL,
                      price_cent BIGINT NOT NULL,
                      saleable BOOLEAN NOT NULL,
                      status VARCHAR(32) NOT NULL,
                      payload_json JSON NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                    """);
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to initialize MySQL table product_skus", error);
        }
    }

    @Override
    public BusinessRecord save(BusinessRecord record) {
        String sql = "INSERT INTO product_skus (id, spu_id, title, category_id, brand_id, price_cent, saleable, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                + "ON DUPLICATE KEY UPDATE spu_id=VALUES(spu_id), title=VALUES(title), category_id=VALUES(category_id), brand_id=VALUES(brand_id), price_cent=VALUES(price_cent), saleable=VALUES(saleable), status=VALUES(status), payload_json=VALUES(payload_json)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            statement.setString(index++, record.id());
            statement.setString(index++, String.valueOf(record.attributes().get("spuId")));
            statement.setString(index++, String.valueOf(record.attributes().get("title")));
            statement.setString(index++, String.valueOf(record.attributes().get("categoryId")));
            statement.setString(index++, String.valueOf(record.attributes().get("brandId")));
            statement.setLong(index++, ((Number) record.attributes().get("priceCent")).longValue());
            statement.setBoolean(index++, Boolean.TRUE.equals(record.attributes().get("saleable")));
            statement.setString(index++, record.status());
            statement.setString(index, JsonSupport.toJson(record.attributes()));
            statement.executeUpdate();
            return record;
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to save sku " + record.id(), error);
        }
    }

    @Override
    public Optional<BusinessRecord> findById(String id) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM product_skus WHERE id=?")) {
            statement.setString(1, id);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readRecord(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query sku " + id, error);
        }
    }

    @Override
    public List<BusinessRecord> list() {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM product_skus ORDER BY updated_at DESC LIMIT 100")) {
            try (ResultSet rs = statement.executeQuery()) {
                List<BusinessRecord> records = new ArrayList<>();
                while (rs.next()) records.add(readRecord(rs));
                return records;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to list sku", error);
        }
    }

    private BusinessRecord readRecord(ResultSet rs) throws SQLException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("skuId", rs.getString("id"));
        attributes.put("spuId", rs.getString("spu_id"));
        attributes.put("title", rs.getString("title"));
        attributes.put("categoryId", rs.getString("category_id"));
        attributes.put("brandId", rs.getString("brand_id"));
        attributes.put("priceCent", rs.getLong("price_cent"));
        attributes.put("saleable", rs.getBoolean("saleable"));
        return new BusinessRecord(rs.getString("id"), rs.getString("status"), attributes);
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }
}
