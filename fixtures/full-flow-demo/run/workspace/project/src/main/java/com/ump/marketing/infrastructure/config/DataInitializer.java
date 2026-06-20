package com.ump.marketing.infrastructure.config;

import com.ump.marketing.domain.model.ActivityTool;
import com.ump.marketing.domain.model.RegionCell;
import com.ump.marketing.infrastructure.mapper.ActivityToolMapper;
import com.ump.marketing.infrastructure.mapper.RegionCellMapper;
import com.ump.marketing.infrastructure.sharding.RegionRouter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Initializes default seed data on first startup: default tools and CN region cell.
 * Only inserts if data does not already exist.
 */
@Component
public class DataInitializer implements ApplicationRunner {

    @Autowired
    private ActivityToolMapper activityToolMapper;

    @Autowired
    private RegionCellMapper regionCellMapper;

    @Autowired
    private RegionRouter regionRouter;

    @Override
    public void run(ApplicationArguments args) {
        long now = System.currentTimeMillis();

        // Insert default region cell for CN if not present
        RegionCell cnCell = regionCellMapper.selectByRegionCode("CN");
        if (cnCell == null) {
            cnCell = new RegionCell();
            cnCell.setRegionCode("CN");
            cnCell.setRegionName("China");
            cnCell.setDbShardKey("shard-cn");
            cnCell.setRedisNamespace("cn");
            cnCell.setKafkaTopicPrefix("cn-");
            cnCell.setCurrency("CNY");
            cnCell.setLanguage("zh-CN");
            cnCell.setStatus("ACTIVE");
            cnCell.setIsDeleted(false);
            cnCell.setVersion(0);
            cnCell.setCreatedAt(now);
            cnCell.setUpdatedAt(now);
            cnCell.setCreatedBy("system");
            cnCell.setUpdatedBy("system");
            regionCellMapper.insert(cnCell);
            regionRouter.registerCell(cnCell);
        }

        // Insert default activity tools
        ensureTool("tool-full-reduce", "tenant-default", "满减活动", "FULL_REDUCE",
                "Full reduction: spend X get Y off", now);
        ensureTool("tool-single-discount", "tenant-default", "单品折扣", "SINGLE_DISCOUNT",
                "Single item discount", now);
        ensureTool("tool-coupon", "tenant-default", "优惠券活动", "COUPON",
                "Coupon-based promotion", now);
    }

    private void ensureTool(String toolId, String tenantId, String toolName, String toolType,
                            String description, long now) {
        // Try CN region first
        ActivityTool existing = activityToolMapper.selectByToolId(toolId, "CN");
        if (existing != null) {
            return;
        }
        ActivityTool tool = new ActivityTool();
        tool.setToolId(toolId);
        tool.setTenantId(tenantId);
        tool.setToolName(toolName);
        tool.setToolType(toolType);
        tool.setToolDescription(description);
        tool.setExclusionRules("{}");
        tool.setPriority(0);
        tool.setStatus("ACTIVE");
        tool.setIsDeleted(false);
        tool.setVersion(0);
        tool.setRegionCode("CN");
        tool.setCreatedAt(now);
        tool.setUpdatedAt(now);
        tool.setCreatedBy("system");
        tool.setUpdatedBy("system");
        activityToolMapper.insert(tool);
    }
}
