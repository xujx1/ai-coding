package com.ump.marketing.infrastructure.sharding;

import com.ump.marketing.domain.model.RegionCell;
import com.ump.marketing.infrastructure.mapper.RegionCellMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves region codes to {@link RegionCell} metadata (DB shard, Redis namespace, Kafka prefix, etc.).
 * <p>
 * Cells are loaded from {@code t_region_cell} at startup and cached in a {@link ConcurrentHashMap}.
 * Unknown regions trigger a lazy DB load; if still not found an {@link IllegalStateException} is thrown.
 * <p>
 * Also provides {@link #assertRegionAccess(String, String)} to prevent cross-region data access.
 */
@Component
public class RegionRouter {

    @Autowired
    private RegionCellMapper regionCellMapper;

    // Cache region cells in a ConcurrentHashMap
    private final ConcurrentHashMap<String, RegionCell> cellCache = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        // Load all cells at startup
        List<RegionCell> cells = regionCellMapper.selectAll();
        for (RegionCell cell : cells) {
            cellCache.put(cell.getRegionCode(), cell);
        }
    }

    public RegionCell resolve(String regionCode) {
        if (regionCode == null || regionCode.isEmpty()) {
            throw new IllegalArgumentException("regionCode is required");
        }
        RegionCell cell = cellCache.get(regionCode);
        if (cell == null) {
            // Try loading from DB
            cell = regionCellMapper.selectByRegionCode(regionCode);
            if (cell != null) {
                cellCache.put(regionCode, cell);
            } else {
                throw new IllegalStateException("Unknown region: " + regionCode);
            }
        }
        return cell;
    }

    public void registerCell(RegionCell cell) {
        cellCache.put(cell.getRegionCode(), cell);
    }

    /**
     * Verify data region matches request region (for cross-region access prevention).
     * Throws {@link SecurityException} if the regions differ.
     */
    public void assertRegionAccess(String requestRegion, String dataRegion) {
        if (!requestRegion.equals(dataRegion)) {
            throw new SecurityException("Cross-region access denied: request=" + requestRegion + " data=" + dataRegion);
        }
    }
}
