## Process management

This project uses zapper for running native processes, containers, and one-off tasks. Zapper manages ports and env vars. Any changes to the stack would be done through zap.yaml. Any process or command that needs env vars would need to be run through zapper. The project may well already be running in the background. Check and manage with:

```
zap status # See what's running
zap up # Start everything
zap logs <service> --no-follow # View logs
zap restart <service> # Restart a service
zap task <task> # Run a one off task
```

The port management is very important. No local dev ports should be in .env files or committed to git. It's all managed through zap.yaml.

See [https://docs.zapper.mp-lb.dev/llms-full.txt](https://docs.zapper.mp-lb.dev/llms-full.txt) for full usage guide.
