# Keep this file synchronized (without the comment) with the Fish snippet in README.md.

function __orchardist_parse_discriminators
    set -eg __orchardist_paths __orchardist_names __orchardist_symbols
    set -g __orchardist_parsed_discriminators "$ORCHARDIST_DISCRIMINATORS"
    test -n "$__orchardist_parsed_discriminators"; or return 1

    set -l parts (string split -n ';' -- $__orchardist_parsed_discriminators)
    set -l index 1
    while test (math $index + 2) -le (count $parts)
        set -l path $parts[$index]
        set -l name $parts[(math $index + 1)]
        set -l symbol $parts[(math $index + 2)]
        if test -n "$path" -a -n "$symbol"
            set -ag __orchardist_paths $path
            set -ag __orchardist_names $name
            set -ag __orchardist_symbols $symbol
        end
        set index (math $index + 3)
    end
end

function __orchardist_match --argument-names dir
    set -q ORCHARDIST_DISCRIMINATORS; or return 1
    if not set -q __orchardist_parsed_discriminators
        __orchardist_parse_discriminators; or return 1
    else if test "$__orchardist_parsed_discriminators" != "$ORCHARDIST_DISCRIMINATORS"
        __orchardist_parse_discriminators; or return 1
    end

    set -l best 0
    set -l best_length 0
    set -l index 1
    for path in $__orchardist_paths
        if test "$dir" = "$path"; or string match -q -- "$path/*" "$dir"
            set -l length (string length -- $path)
            if test $length -gt $best_length
                set best $index
                set best_length $length
            end
        end
        set index (math $index + 1)
    end

    if test $best -gt 0
        echo $best
        return 0
    end
    return 1
end

function __orchardist_on_pwd --on-variable PWD
    status is-interactive; or return
    set -l match (__orchardist_match "$PWD")
    if test $status -eq 0
        set -gx ORCHARDIST_WORKTREE_NAME $__orchardist_names[$match]
        set -gx ORCHARDIST_WORKTREE_SYMBOL $__orchardist_symbols[$match]
    else
        set -e ORCHARDIST_WORKTREE_NAME ORCHARDIST_WORKTREE_SYMBOL
    end
end

status is-interactive
and set -q ORCHARDIST_DISCRIMINATORS
and __orchardist_on_pwd
