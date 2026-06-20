{{base_system_prompt}}

## 当前子任务

{{task_description}}

只处理项目：{{project_name}}
项目根目录：{{project_root}}
运行目录：{{run_dir}}
产物目录：{{artifacts_dir}}

读取 `artifacts/...` 产物时，必须以“产物目录”为根目录解析，不要拼到项目根目录下面。
