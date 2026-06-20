package demo;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DemoServiceTest {
    @Test
    void pipelineStatusContainsProjectName() {
        DemoService service = new DemoService();
        assertTrue(service.pipelineStatus().contains("{{project_name}}"));
    }
}
