package com.ecommerce.trade;

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
                System.getenv().getOrDefault("DB_URL", "jdbc:mysql://localhost:3306/ecom_trade_orders?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"),
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
                    CREATE TABLE IF NOT EXISTS trade_orders (
                      id VARCHAR(64) PRIMARY KEY,
                      user_id VARCHAR(255) NOT NULL,
                      sku_id VARCHAR(255) NOT NULL,
                      quantity INT NOT NULL,
                      pay_amount_cent BIGINT NOT NULL,
                      promotion_reservation_id VARCHAR(255) NOT NULL,
                      stock_reservation_id VARCHAR(255) NOT NULL,
                      status VARCHAR(32) NOT NULL,
                      payload_json JSON NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                    """);
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to initialize MySQL table trade_orders", error);
        }
    }

    @Override
    public BusinessRecord save(BusinessRecord record) {
        String sql = "INSERT INTO trade_orders (id, user_id, sku_id, quantity, pay_amount_cent, promotion_reservation_id, stock_reservation_id, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                + "ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), sku_id=VALUES(sku_id), quantity=VALUES(quantity), pay_amount_cent=VALUES(pay_amount_cent), promotion_reservation_id=VALUES(promotion_reservation_id), stock_reservation_id=VALUES(stock_reservation_id), status=VALUES(status), payload_json=VALUES(payload_json)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            statement.setString(index++, record.id());
            statement.setString(index++, String.valueOf(record.attributes().get("userId")));
            statement.setString(index++, String.valueOf(record.attributes().get("skuId")));
            statement.setInt(index++, ((Number) record.attributes().get("quantity")).intValue());
            statement.setLong(index++, ((Number) record.attributes().get("payAmountCent")).longValue());
            statement.setString(index++, String.valueOf(record.attributes().get("promotionReservationId")));
            statement.setString(index++, String.valueOf(record.attributes().get("stockReservationId")));
            statement.setString(index++, record.status());
            statement.setString(index, JsonSupport.toJson(record.attributes()));
            statement.executeUpdate();
            return record;
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to save order " + record.id(), error);
        }
    }

    @Override
    public Optional<BusinessRecord> findById(String id) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM trade_orders WHERE id=?")) {
            statement.setString(1, id);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readRecord(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query order " + id, error);
        }
    }

    @Override
    public List<BusinessRecord> list() {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM trade_orders ORDER BY updated_at DESC LIMIT 100")) {
            try (ResultSet rs = statement.executeQuery()) {
                List<BusinessRecord> records = new ArrayList<>();
                while (rs.next()) records.add(readRecord(rs));
                return records;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to list order", error);
        }
    }

    private BusinessRecord readRecord(ResultSet rs) throws SQLException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("orderId", rs.getString("id"));
        attributes.put("userId", rs.getString("user_id"));
        attributes.put("skuId", rs.getString("sku_id"));
        attributes.put("quantity", rs.getInt("quantity"));
        attributes.put("payAmountCent", rs.getLong("pay_amount_cent"));
        attributes.put("promotionReservationId", rs.getString("promotion_reservation_id"));
        attributes.put("stockReservationId", rs.getString("stock_reservation_id"));
        return new BusinessRecord(rs.getString("id"), rs.getString("status"), attributes);
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }
}
