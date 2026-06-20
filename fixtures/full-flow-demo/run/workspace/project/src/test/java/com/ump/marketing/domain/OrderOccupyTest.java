package com.ump.marketing.domain;

import com.ump.marketing.domain.model.OrderOccupy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("OrderOccupy")
class OrderOccupyTest {

    @Test
    @DisplayName("ukOrder returns colon-joined key in regionCode:orderId:userId:activityId format")
    void testUkOrderFormat() {
        String result = OrderOccupy.ukOrder("CN", "O1", "U1", "A1");
        assertEquals("CN:O1:U1:A1", result,
                "ukOrder(\"CN\", \"O1\", \"U1\", \"A1\") should return \"CN:O1:U1:A1\"");
    }

    @Test
    @DisplayName("ukOrder returns consistent results for identical inputs")
    void testUkOrderConsistent() {
        String result1 = OrderOccupy.ukOrder("CN", "O1", "U1", "A1");
        String result2 = OrderOccupy.ukOrder("CN", "O1", "U1", "A1");
        assertEquals(result1, result2,
                "Same inputs to ukOrder should produce identical output");
    }
}
