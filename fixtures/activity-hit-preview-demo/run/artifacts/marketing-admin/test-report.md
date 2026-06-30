# 测试报告

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 项目名称 | marketing-admin |
| 需求名称 | 当前流水线需求 |
| 测试分支 | 未采集（运行目录非 Git 工作区或未读取分支） |
| 测试日期 | 2026-06-30T08:14:53.930Z |
| 测试文件清单 | artifacts/marketing-admin/test-file-list.md |
| 变更清单 | artifacts/marketing-admin/changed-files.json |

---

## 2. 执行摘要

| 指标 | 数值 |
|------|------|
| 测试类数量 | 17 |
| 测试用例总数 | 89 |
| 通过（PASS） | 89 |
| 失败（FAIL） | 0 |
| 错误（ERROR） | 0 |
| 跳过（SKIP） | 0 |
| 通过率 | 100% |
| 总耗时 | 5.788s |
| Maven 次数 | 1 |
| 根因分类 | `success` |
| `mvn test` 退出码 | 0 |
| 权限兜底 | not-needed |
| Surefire 命令行覆盖 | not-needed |

### 2.1 时延拆分

| 步骤 | 耗时 | 备注 |
|------|------|------|
| `mvn test` | 5.788s | 由 maven_test 工具真实执行 |
| `jacoco:report` | 未执行 | 未检测到 target/site/jacoco/jacoco.xml；当前 Maven 测试未生成覆盖率报告。 |
| 增量脚本 | 未执行 | 当前节点未启用精确增量覆盖率 |
| 覆盖率脚本模式 | not-enabled | |

---

## 3. 覆盖率

### 3.1 全量覆盖率（仅供参考）

| 维度 | 覆盖率 |
|------|--------|
| 行覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 分支覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 方法覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 类覆盖率 | 未采集（未检测到 JaCoCo XML） |

### 3.2 精确增量覆盖率

| 维度 | 实际覆盖率 | 目标值 | 是否达标 |
|------|------------|--------|----------|
| 增量行覆盖率 | 未采集 | ≥ 80% | 未判定 |
| 增量分支覆盖率 | 未采集 | 参考 | 未判定 |

### 3.3 覆盖率诊断摘要

| 项 | 内容 |
|----|------|
| 覆盖率脚本首轮结果 | 未执行，项目未生成 JaCoCo XML |
| 是否触发兜底 | 否 |
| 兜底动作 | 无 |
| 最终覆盖率口径 | Maven 单元测试结果；项目未配置或未生成 JaCoCo 覆盖率报告 |

---

## 4. 失败与阻塞分类

| 类型 | 说明 | 结论 |
|------|------|------|
| `runner_asset_failure` | Runner、命令、环境或权限问题 | 继续 |
| `compile_failure` | 测试编译失败 / 依赖缺失 / 执行前失败 | 继续 |
| `test_failure` | 断言失败 / ERROR / 启动失败 | 继续 |
| `coverage_below_threshold` | 用例全绿但精确增量覆盖率不足 | 未判定 |

---

## 5. 用例明细

### 5.1 失败用例

| # | 用例名称 | 所属测试类 | 关联测试任务 | 摘要 |
|---|----------|------------|--------------|------|
| 1 | 无 | 无 | 未采集 | 无失败用例 |

### 5.2 跳过用例

| # | 用例名称 | 原因 |
|---|----------|------|
| 1 | 无 | 无跳过用例 |

### 5.3 关键异常摘要

| # | 类型 | 摘要 |
|---|------|------|
| 1 | 无 | 无关键异常 |

---

## 6. 未覆盖分析

| 文件/方法 | 未覆盖原因 | 建议 |
|-----------|-----------|------|
| 未采集 | 当前节点未执行覆盖率分析 | 后续可接入 JaCoCo 增量覆盖率 |

---

## 7. 结论

**结论**：mvn test 执行成功，未发现失败用例。

**报告路径**：artifacts/marketing-admin/test-report.md

**建议回流链**：进入归档或后续交付检查。

**下一步注意事项**：如需覆盖率门禁，可启用 JaCoCo 增量覆盖率。

## Maven 输出摘要

```text
# 测试报告

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 项目名称 | marketing-admin |
| 需求名称 | 当前流水线需求 |
| 测试分支 | 未采集（运行目录非 Git 工作区或未读取分支） |
| 测试日期 | 2026-06-30T07:59:02.806Z |
| 测试文件清单 | artifacts/marketing-admin/test-file-list.md |
| 变更清单 | artifacts/marketing-admin/changed-files.json |

---

## 2. 执行摘要

| 指标 | 数值 |
|------|------|
| 测试类数量 | 17 |
| 测试用例总数 | 89 |
| 通过（PASS） | 89 |
| 失败（FAIL） | 0 |
| 错误（ERROR） | 0 |
| 跳过（SKIP） | 0 |
| 通过率 | 100% |
| 总耗时 | 5.788s |
| Maven 次数 | 1 |
| 根因分类 | `runner_asset_failure` |
| `mvn test` 退出码 | 非 0 或未采集 |
| 权限兜底 | not-needed |
| Surefire 命令行覆盖 | not-needed |

### 2.1 时延拆分

| 步骤 | 耗时 | 备注 |
|------|------|------|
| `mvn test` | 5.788s | 由 maven_test 工具真实执行 |
| `jacoco:report` | 未执行 | 未检测到 target/site/jacoco/jacoco.xml；当前 Maven 测试未生成覆盖率报告。 |
| 增量脚本 | 未执行 | 当前节点未启用精确增量覆盖率 |
| 覆盖率脚本模式 | not-enabled | |

---

## 3. 覆盖率

### 3.1 全量覆盖率（仅供参考）

| 维度 | 覆盖率 |
|------|--------|
| 行覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 分支覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 方法覆盖率 | 未采集（未检测到 JaCoCo XML） |
| 类覆盖率 | 未采集（未检测到 JaCoCo XML） |

### 3.2 精确增量覆盖率

| 维度 | 实际覆盖率 | 目标值 | 是否达标 |
|------|------------|--------|----------|
| 增量行覆盖率 | 未采集 | ≥ 80% | 未判定 |
| 增量分支覆盖率 | 未采集 | 参考 | 未判定 |

### 3.3 覆盖率诊断摘要

| 项 | 内容 |
|----|------|
| 覆盖率脚本首轮结果 | 未执行，项目未生成 JaCoCo XML |
| 是否触发兜底 | 否 |
| 兜底动作 | 无 |
| 最终覆盖率口径 | Maven 单元测试结果；项目未配置或未生成 JaCoCo 覆盖率报告 |

---

## 4. 失败与阻塞分类

| 类型 | 说明 | 结论 |
|------|------|------|
| `runner_asset_failure` | Runner、命令、环境或权限问题 | 中断 |
| `compile_failure` | 测试编译失败 / 依赖缺失 / 执行前失败 | 继续 |
| `test_failure` | 断言失败 / ERROR / 启动失败 | 继续 |
| `coverage_below_threshold` | 用例全绿但精确增量覆盖率不足 | 未判定 |

---

## 5. 用例明细

### 5.1 失败用例

| # | 用例名称 | 所属测试类 | 关联测试任务 | 摘要 |
|---|----------|------------|--------------|------|
| 1 | 无 | 无 | 未采集 | 无失败用例 |

### 5.2 跳过用例

| # | 用例名称 | 原因 |
|---|----------|------|
| 1 | 无 | 无跳过用例 |

### 5.3 关键异常摘要

| # | 类型 | 摘要 |
|---|------|------|
| 1 | runner_asset_failure | 未能从 Maven 输出中识别成功、编译失败或测试失败。 |

---

## 6. 未覆盖分析

| 文件/方法 | 未覆盖原因 | 建议 |
|-----------|-----------|------|
| 未采集 | 当前节点未执行覆盖率分析 | 后续可接入 JaCoCo 增量覆盖率 |

---

## 7. 结论

**结论**：mvn test 未通过，分类为 runner_asset_failure：未能从 Maven 输出中识别成功、编译失败或测试失败。

**报告路径**：artifacts/marketing-admin/test-report.md

**建议回流链**：回流到 Java 实现或测试代码节点修复后重跑。

**下一步注意事项**：优先查看 Maven 输出摘要和 surefire-reports。

## Maven 输出摘要

```text
$ "/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn" test -B
(cwd: workspace/project/marketing-admin)
[INFO] Scanning for projects...
[INFO] 
[INFO] ----------------------< com.ump:marketing-admin >-----------------------
[INFO] Building UMP Marketing Admin 1.0.0-Sprint1
[INFO]   from pom.xml
[INFO] --------------------------------[ jar ]---------------------------------
[INFO] 
[INFO] --- resources:3.2.0:resources (default-resources) @ marketing-admin ---
[INFO] Using 'UTF-8' encoding to copy filtered resources.
[INFO] Using 'UTF-8' encoding to copy filtered properties files.
[INFO] Copying 11 resources
[INFO] 
[INFO] --- compiler:3.10.1:compile (default-compile) @ marketing-admin ---
[INFO] Nothing to compile - all classes are up to date
[INFO] 
[INFO] --- resources:3.2.0:testResources (default-testResources) @ marketing-admin ---
[INFO] Using 'UTF-8' encoding to copy filtered resources.
[INFO] Using 'UTF-8' encoding to copy filtered properties files.
[INFO] Copying 2 resources
[INFO] 
[INFO] --- compiler:3.10.1:testCompile (default-testCompile) @ marketing-admin ---
[INFO] Nothing to compile - all classes are up to date
[INFO] 
[INFO] --- surefire:2.22.2:test (default-test) @ marketing-admin ---
[INFO] 
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running com.ump.marketing.web.controller.PreviewControllerTest
15:57:50.280 [main] DEBUG org.jboss.logging - Logging Provider: org.jboss.logging.Log4j2LoggerProvider
15:57:50.282 [main] INFO org.hibernate.validator.internal.util.Version - HV000001: Hibernate Validator 6.2.5.Final
15:57:50.303 [main] DEBUG org.hibernate.validator.messageinterpolation.ResourceBundleMessageInterpolator - Loaded expression factory via original TCCL
15:57:50.303 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom MessageInterpolator of type org.springframework.validation.beanvalidation.LocaleContextMessageInterpolator
15:57:50.304 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom ParameterNameProvider of type org.springframework.validation.beanvalidation.LocalValidatorFactoryBean$1
15:57:50.307 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - Trying to load META-INF/validation.xml for XML based Validator configuration.
15:57:50.308 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via TCCL
15:57:50.308 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via Hibernate Validator's class loader
15:57:50.308 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - No META-INF/validation.xml found. Using annotation based configuration only.
15:57:50.313 [main] DEBUG org.hibernate.validator.internal.engine.resolver.TraversableResolvers - Cannot find javax.persistence.Persistence on classpath. Assuming non JPA 2 environment. All properties will per default be traversable.
15:57:50.404 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000252: Using org.hibernate.validator.internal.engine.DefaultPropertyNodeNameProvider as property node name provider.
15:57:50.408 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.springframework.validation.beanvalidation.LocaleContextMessageInterpolator as ValidatorFactory-scoped message interpolator.
15:57:50.409 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.resolver.TraverseAllTraversableResolver as ValidatorFactory-scoped traversable resolver.
15:57:50.409 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.util.ExecutableParameterNameProvider as ValidatorFactory-scoped parameter name provider.
15:57:50.409 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.DefaultClockProvider as ValidatorFactory-scoped clock provider.
15:57:50.409 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.scripting.DefaultScriptEvaluatorFactory as ValidatorFactory-scoped script evaluator factory.
15:57:50.505 [main] DEBUG _org.springframework.web.servlet.HandlerMapping.Mappings - 
	c.u.m.w.c.PreviewController:
	{POST [/api/preview/activity-hit]}: previewActivityHit(PreviewQueryRequest,HttpServletRequest)
15:57:50.513 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping - 1 mappings in org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
15:57:50.586 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter - ControllerAdvice beans: 0 @ModelAttribute, 0 @InitBinder, 1 RequestBodyAdvice, 1 ResponseBodyAdvice
15:57:50.617 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver - ControllerAdvice beans: 1 @ExceptionHandler, 1 ResponseBodyAdvice
15:57:50.641 [main] INFO org.springframework.mock.web.MockServletContext - Initializing Spring TestDispatcherServlet ''
15:57:50.641 [main] INFO org.springframework.test.web.servlet.TestDispatcherServlet - Initializing Servlet ''
15:57:50.644 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - Detected AcceptHeaderLocaleResolver
15:57:50.644 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - Detected FixedThemeResolver
15:57:50.645 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - Detected org.springframework.web.servlet.view.DefaultRequestToViewNameTranslator@985696
15:57:50.645 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - Detected org.springframework.web.servlet.support.SessionFlashMapManager@5bcde458
15:57:50.645 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - enableLoggingRequestDetails='false': request parameters and headers will be masked to prevent unsafe logging of potentially sensitive data
15:57:50.645 [main] INFO org.springframework.test.web.servlet.TestDispatcherServlet - Completed initialization in 4 ms
15:57:50.737 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - POST "/api/preview/activity-hit", parameters={}
15:57:50.740 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping - Mapped to com.ump.marketing.web.controller.PreviewController#previewActivityHit(PreviewQueryRequest, HttpServletRequest)
15:57:50.795 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor - Read "application/json" to [PreviewQueryRequest(productId=product-1, skuId=null, scopeType=null)]
15:57:50.886 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor - Using 'application/json', given [*/*] and supported [application/json, application/*+json]
15:57:50.886 [main] DEBUG org.springframework.web.servlet.mvc.method.annotation.RequestResponseBodyMethodProcessor - Writing [RpcResult(code=0, message=SUCCESS, requestId=req-degraded, data=PreviewResponseDTO(managementResult= (truncated)...]
15:57:50.909 [main] DEBUG org.springframework.test.web.servlet.TestDispatcherServlet - Completed 200 OK
15:57:50.945 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['code']
15:57:50.949 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['success']
15:57:50.949 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['requestId']
15:57:50.949 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['data']['runtimeResult']['available']
15:57:50.950 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['data']['runtimeResult']['summary']
15:57:50.951 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['data']['diffHints'][0]['code']
15:57:50.951 [main] DEBUG com.jayway.jsonpath.internal.path.CompiledPath - Evaluating path: $['data']['diffHints'][0]['title']
15:57:50.968 [main] DEBUG org.hibernate.validator.messageinterpolation.ResourceBundleMessageInterpolator - Loaded expression factory via original TCCL
15:57:50.968 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom MessageInterpolator of type org.springframework.validation.beanvalidation.LocaleContextMessageInterpolator
15:57:50.968 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom ParameterNameProvider of type org.springframework.validation.beanvalidation.LocalValidatorFactoryBean$1
15:57:50.968 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - Trying to load META-INF/validation.xml for XML based Validator configuration.
15:57:50.968 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via TCCL
15:57:50.969 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via Hibernate Validator's class loader
15:57:50.969 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - No META-IN
```

...（已截断）
