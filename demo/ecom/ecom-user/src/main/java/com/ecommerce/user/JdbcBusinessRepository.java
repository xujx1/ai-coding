package com.ecommerce.user;

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
                System.getenv().getOrDefault("DB_URL", "jdbc:mysql://localhost:3306/ecom_user_profiles?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"),
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
                    CREATE TABLE IF NOT EXISTS user_profiles (
                      id VARCHAR(64) PRIMARY KEY,
                      mobile VARCHAR(255) NOT NULL,
                      member_level VARCHAR(255) NOT NULL,
                      address VARCHAR(255) NOT NULL,
                      tags VARCHAR(255) NOT NULL,
                      status VARCHAR(32) NOT NULL,
                      payload_json JSON NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                    """);
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to initialize MySQL table user_profiles", error);
        }
    }

    @Override
    public BusinessRecord save(BusinessRecord record) {
        String sql = "INSERT INTO user_profiles (id, mobile, member_level, address, tags, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?) "
                + "ON DUPLICATE KEY UPDATE mobile=VALUES(mobile), member_level=VALUES(member_level), address=VALUES(address), tags=VALUES(tags), status=VALUES(status), payload_json=VALUES(payload_json)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = 1;
            statement.setString(index++, record.id());
            statement.setString(index++, String.valueOf(record.attributes().get("mobile")));
            statement.setString(index++, String.valueOf(record.attributes().get("memberLevel")));
            statement.setString(index++, String.valueOf(record.attributes().get("address")));
            statement.setString(index++, String.valueOf(record.attributes().get("tags")));
            statement.setString(index++, record.status());
            statement.setString(index, JsonSupport.toJson(record.attributes()));
            statement.executeUpdate();
            return record;
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to save user " + record.id(), error);
        }
    }

    @Override
    public Optional<BusinessRecord> findById(String id) {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM user_profiles WHERE id=?")) {
            statement.setString(1, id);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(readRecord(rs));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to query user " + id, error);
        }
    }

    @Override
    public List<BusinessRecord> list() {
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM user_profiles ORDER BY updated_at DESC LIMIT 100")) {
            try (ResultSet rs = statement.executeQuery()) {
                List<BusinessRecord> records = new ArrayList<>();
                while (rs.next()) records.add(readRecord(rs));
                return records;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Failed to list user", error);
        }
    }

    private BusinessRecord readRecord(ResultSet rs) throws SQLException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("userId", rs.getString("id"));
        attributes.put("mobile", rs.getString("mobile"));
        attributes.put("memberLevel", rs.getString("member_level"));
        attributes.put("address", rs.getString("address"));
        attributes.put("tags", rs.getString("tags"));
        return new BusinessRecord(rs.getString("id"), rs.getString("status"), attributes);
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }
}
