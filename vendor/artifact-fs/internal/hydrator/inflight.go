package hydrator

type inflight[T any] map[string][]chan T

func newInflight[T any]() inflight[T] {
	return make(map[string][]chan T)
}

func (f inflight[T]) add(key string, ch chan T) bool {
	f[key] = append(f[key], ch)
	return len(f[key]) == 1
}

func (f inflight[T]) remove(key string, ch chan T) {
	waiters, ok := f[key]
	if !ok {
		return
	}
	for i, waiter := range waiters {
		if waiter != ch {
			continue
		}
		waiters = append(waiters[:i], waiters[i+1:]...)
		if len(waiters) == 0 {
			delete(f, key)
		} else {
			f[key] = waiters
		}
		return
	}
}

func (f inflight[T]) take(key string) []chan T {
	waiters := f[key]
	delete(f, key)
	return waiters
}

func (f inflight[T]) closeAll(value T) {
	for key := range f {
		notifyWaiters(f.take(key), value)
	}
}

func notifyWaiters[T any](waiters []chan T, value T) {
	for _, ch := range waiters {
		ch <- value
		close(ch)
	}
}
