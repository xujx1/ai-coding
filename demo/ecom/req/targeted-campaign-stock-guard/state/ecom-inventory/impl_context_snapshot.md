# ecom-inventory 实现上下文快照

库存服务当前主表记录 `quantity` 和 `availableQuantity`。本次新增活动库存保护记录，与主库存表隔离；释放只改变保护记录状态，不直接增加主库存。
