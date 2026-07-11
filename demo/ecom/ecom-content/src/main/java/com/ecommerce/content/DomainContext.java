package com.ecommerce.content;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "content";
    public static final String DOMAIN_NAME = "内容域";
    public static final String SERVICE_NAME = "Content Service";
    public static final int PORT = 4220;
    public static final String SUMMARY = "Manages product content, posts, short videos, live sessions, comments, creators, and moderation workflow.";
    public static final List<String> CAPABILITIES = List.of("post", "short-video", "live-session", "comment", "creator", "content-moderation");
    public static final List<String> OWNS = List.of("post", "video", "live-room", "comment", "creator-profile");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("product", "merchant", "user");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("marketing", "customer-service");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("内容", "短视频", "直播", "图文", "评论", "达人", "种草");
    public static final List<String> SAMPLE_ROUTES = List.of("/posts", "/videos", "/comments/moderation");

    private DomainContext() {
    }
}
