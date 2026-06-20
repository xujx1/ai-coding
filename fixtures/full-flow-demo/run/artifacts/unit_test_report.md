# Unit Test Report

**Timestamp:** 2026-06-20T07:33:48.579Z

## com.ump.marketing.application.service.ActivityServiceTest.txt
```
-------------------------------------------------------------------------------
Test set: com.ump.marketing.application.service.ActivityServiceTest
-------------------------------------------------------------------------------
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.125 s - in com.ump.marketing.application.service.ActivityServiceTest

```

## com.ump.marketing.web.controller.ActivityControllerTest.txt
```
-------------------------------------------------------------------------------
Test set: com.ump.marketing.web.controller.ActivityControllerTest
-------------------------------------------------------------------------------
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 2.112 s - in com.ump.marketing.web.controller.ActivityControllerTest

```

## Output Summary

```
$ "/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn" test -B -Dtest=com.ump.marketing.application.service.ActivityServiceTest,com.ump.marketing.web.controller.ActivityControllerTest -Dtest=ActivityServiceTest,ActivityControllerTest test
(cwd: workspace/project)
[INFO] Scanning for projects...
[INFO] 
[INFO] -----------------------< com.ump:ump-marketing >------------------------
[INFO] Building UMP Marketing Platform v1 1.0.0-Sprint1
[INFO]   from pom.xml
[INFO] --------------------------------[ jar ]---------------------------------
[INFO] 
[INFO] --- resources:3.2.0:resources (default-resources) @ ump-marketing ---
[INFO] Using 'UTF-8' encoding to copy filtered resources.
[INFO] Using 'UTF-8' encoding to copy filtered properties files.
[INFO] Copying 6 resources
[INFO] 
[INFO] --- compiler:3.10.1:compile (default-compile) @ ump-marketing ---
[INFO] Nothing to compile - all classes are up to date
[INFO] 
[INFO] --- resources:3.2.0:testResources (default-testResources) @ ump-marketing ---
[INFO] Using 'UTF-8' encoding to copy filtered resources.
[INFO] Using 'UTF-8' encoding to copy filtered properties files.
[INFO] Copying 2 resources
[INFO] 
[INFO] --- compiler:3.10.1:testCompile (default-testCompile) @ ump-marketing ---
[INFO] Nothing to compile - all classes are up to date
[INFO] 
[INFO] --- surefire:2.22.2:test (default-test) @ ump-marketing ---
[INFO] 
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running com.ump.marketing.web.controller.ActivityControllerTest
15:33:46.931 [main] DEBUG org.jboss.logging - Logging Provider: org.jboss.logging.Log4j2LoggerProvider
15:33:46.933 [main] INFO org.hibernate.validator.internal.util.Version - HV000001: Hibernate Validator 6.2.5.Final
15:33:46.954 [main] DEBUG org.hibernate.validator.messageinterpolation.ResourceBundleMessageInterpolator - Loaded expression factory via original TCCL
15:33:46.955 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom MessageInterpolator of type org.springframework.validation.beanvalidation.LocaleContextMessageInterpolator
15:33:46.955 [main] DEBUG org.hibernate.validator.internal.engine.AbstractConfigurationImpl - Setting custom ParameterNameProvider of type org.springframework.validation.beanvalidation.LocalValidatorFactoryBean$1
15:33:46.958 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - Trying to load META-INF/validation.xml for XML based Validator configuration.
15:33:46.958 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via TCCL
15:33:46.959 [main] DEBUG org.hibernate.validator.internal.xml.config.ResourceLoaderHelper - Trying to load META-INF/validation.xml via Hibernate Validator's class loader
15:33:46.959 [main] DEBUG org.hibernate.validator.internal.xml.config.ValidationXmlParser - No META-INF/validation.xml found. Using annotation based configuration only.
15:33:46.962 [main] DEBUG org.hibernate.validator.internal.engine.resolver.TraversableResolvers - Cannot find javax.persistence.Persistence on classpath. Assuming non JPA 2 environment. All properties will per default be traversable.
15:33:47.045 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000252: Using org.hibernate.validator.internal.engine.DefaultPropertyNodeNameProvider as property node name provider.
15:33:47.049 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.springframework.validation.beanvalidation.LocaleContextMessageInterpolator as ValidatorFactory-scoped message interpolator.
15:33:47.049 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.resolver.TraverseAllTraversableResolver as ValidatorFactory-scoped traversable resolver.
15:33:47.049 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.util.ExecutableParameterNameProvider as ValidatorFactory-scoped parameter name provider.
15:33:47.050 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.DefaultClockProvider as ValidatorFactory-scoped clock provider.
15:33:47.050 [main] DEBUG org.hibernate.validator.internal.engine.ValidatorFactoryConfigurationHelper - HV000234: Using org.hibernate.validator.internal.engine.scripting.DefaultScriptEvaluatorFactory as ValidatorFactory-scoped script evaluator factory.
15:33:47.146 [main] DEBUG _org.springframework.web.servlet.HandlerMapping.Mappings - 
	c.u.m.w.c.ActivityController:
	{POST [/api/activity/submitApproval]}: submitApproval(SubmitApprovalRequest)
	{POST [/api/activity/forceOffline]}: forceOffline(ForceOf
```
