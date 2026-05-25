package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/cloudflare/artifact-fs/internal/cli"
)

// main keeps CLI wiring separate from the testable command implementation.
func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	os.Exit(cli.Run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
